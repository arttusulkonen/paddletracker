'use client';

import { ProtectedRoute } from '@/components/ProtectedRoutes';
import { CreateRoomDialog } from '@/components/rooms/CreateRoomDialog';
import { RoomCard } from '@/components/rooms/RoomCard';
import {
	Card,
	CardDescription,
	CardTitle,
	Input,
	Skeleton,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
import { db } from '@/lib/firebase';
import type { Room } from '@/lib/types';
import {
	collection,
	doc,
	type DocumentData,
	getDoc,
	getDocs,
	onSnapshot,
	query,
	where,
} from 'firebase/firestore';
import { Search, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Helper for parsing dates
const parseRoomDate = (val: unknown): number => {
  if (!val) return 0;
  if (
    typeof val === 'object' &&
    val !== null &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    return (val as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof val === 'number') return val;
  const str = String(val).trim();
  if (str.includes('.')) {
    const parts = str.split(' ');
    const dateParts = parts[0].split('.');
    const timeParts = parts[1] ? parts[1].split('.') : ['00', '00', '00'];
    if (dateParts.length === 3) {
      const d = new Date(
        +dateParts[2],
        +dateParts[1] - 1,
        +dateParts[0],
        +(timeParts[0] || 0),
        +(timeParts[1] || 0),
        +(timeParts[2] || 0)
      );
      if (!isNaN(d.getTime())) return d.getTime();
    }
  }
  const iso = Date.parse(str);
  if (!isNaN(iso)) return iso;
  return 0;
};

// Extended Type
type RoomWithMeta = Room & {
  isFinished?: boolean;
  creatorName?: string;
  _sortTs: number;
  communityId?: string | null;
  communityName?: string; // Correctly added
};

export default function RoomsPage() {
  const { t } = useTranslation();
  const { user, userProfile } = useAuth();
  const { config } = useSport();

  const [allRooms, setAllRooms] = useState<RoomWithMeta[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [myMatches, setMyMatches] = useState<Record<string, number>>({});
  const [roomRating, setRoomRating] = useState<Record<string, number>>({});
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => setHasMounted(true), []);

  // --- 1. Load Rooms & Metadata ---
  useEffect(() => {
    if (!user || !db) {
      setIsLoadingRooms(false);
      return;
    }
    setIsLoadingRooms(true);

    const roomsCollectionName = config.collections.rooms;
    const roomsMap = new Map<string, DocumentData>();

    const processRooms = async (
      rawMap: Map<string, DocumentData>
    ): Promise<RoomWithMeta[]> => {
      const list = Array.from(rawMap.values());

      // 1. Collect Creator IDs
      const creatorIds = [
        ...new Set(
          list
            .map((r) => r.creator || r.createdBy)
            .filter((id): id is string => !!id)
        ),
      ];
      const creatorNameMap: Record<string, string> = {};

      if (creatorIds.length > 0) {
        await Promise.all(
          creatorIds.map(async (uid) => {
            if (creatorNameMap[uid]) return;
            try {
              const snap = await getDoc(doc(db!, 'users', uid));
              if (snap.exists()) {
                const data = snap.data();
                creatorNameMap[uid] =
                  data?.name || data?.displayName || t('Unknown');
              }
            } catch (e) {
              console.error(e);
            }
          })
        );
      }

      // 2. Collect Community IDs to fetch names
      const communityIds = [
        ...new Set(
          list.map((r) => r.communityId).filter((id): id is string => !!id)
        ),
      ];
      const communityNameMap: Record<string, string> = {};

      if (communityIds.length > 0) {
        await Promise.all(
          communityIds.map(async (cid) => {
            if (communityNameMap[cid]) return;
            try {
              const snap = await getDoc(doc(db!, 'communities', cid));
              if (snap.exists()) {
                communityNameMap[cid] = snap.data().name;
              }
            } catch (e) {
              console.error('Failed to load community name', e);
            }
          })
        );
      }

      // 3. Process Ratings
      const ratingMap: Record<string, number> = {};
      list.forEach((r) => {
        const members = r.members || [];
        const me = members.find((m: any) => m.userId === user.uid);
        ratingMap[r.id] = me?.rating ?? 0;
      });
      setRoomRating(ratingMap);

      // 4. Map Result
      return list.map((data) => {
        const creatorId = data.creator || data.createdBy;
        return {
          ...(data as Room),
          id: data.id,
          creatorName: creatorNameMap[creatorId] || data.creatorName,
          isFinished: (data.seasonHistory?.length ?? 0) > 0,
          _sortTs: parseRoomDate(
            data.createdAt || data.roomCreated || data.created
          ),
          communityId: data.communityId || null,
          communityName: data.communityId
            ? communityNameMap[data.communityId]
            : undefined,
        };
      });
    };

    // Query: Rooms where I am a member
    const qMyRooms = query(
      collection(db!, roomsCollectionName),
      where('memberIds', 'array-contains', user.uid)
    );

    const handleSnapshot = async (snap: { docs: DocumentData[] }) => {
      snap.docs.forEach((d) => roomsMap.set(d.id, { id: d.id, ...d.data() }));
      const processed = await processRooms(new Map(roomsMap));
      processed.sort((a, b) => b._sortTs - a._sortTs);
      setAllRooms(processed);
      setIsLoadingRooms(false);
    };

    const unsubMy = onSnapshot(qMyRooms, handleSnapshot as any);
    return () => unsubMy();
  }, [user, t, config.collections.rooms]);

  // --- 2. Load Match Counts ---
  const loadMyCounts = useCallback(
    async (roomsToLoad: Room[]) => {
      if (!user || roomsToLoad.length === 0 || !db) return;
      const matchesCollectionName = config.collections.matches;
      const res: Record<string, number> = {};

      await Promise.all(
        roomsToLoad.map(async (r) => {
          if (myMatches[r.id] !== undefined) return;
          const qy = query(
            collection(db!, matchesCollectionName),
            where('roomId', '==', r.id),
            where('players', 'array-contains', user.uid)
          );
          const snap = await getDocs(qy);
          res[r.id] = snap.size;
        })
      );

      if (Object.keys(res).length > 0) {
        setMyMatches((prev) => ({ ...prev, ...res }));
      }
    },
    [user, config.collections.matches, myMatches]
  );

  useEffect(() => {
    if (allRooms.length > 0) {
      const myMemberRooms = allRooms.filter((r) =>
        r.memberIds?.includes(user?.uid || '')
      );
      loadMyCounts(myMemberRooms);
    }
  }, [allRooms, loadMyCounts, user]);

  // --- 3. Filter Rooms ---
  const filteredRooms = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return allRooms.filter(
      (r) =>
        r.name.toLowerCase().includes(lowerSearch) ||
        (r.creatorName ?? '').toLowerCase().includes(lowerSearch) ||
        (r.communityName ?? '').toLowerCase().includes(lowerSearch)
    );
  }, [allRooms, searchTerm]);

  const canCreateRoom = userProfile && !userProfile.isGhost;

  if (!hasMounted) return null;

  return (
    <ProtectedRoute>
      <div className='container mx-auto py-8 px-4 min-h-screen flex flex-col'>
        {/* Header */}
        <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8'>
          <div>
            <h1 className='text-4xl font-extrabold tracking-tight flex items-center gap-3'>
              <Users className='h-10 w-10 text-primary' />
              {t('Match Rooms')}
            </h1>
            <p className='text-muted-foreground mt-1 text-lg'>
              {t('Join a club or create your own league.')}
            </p>
          </div>
          {canCreateRoom && <CreateRoomDialog />}
        </div>

        {/* Search */}
        <div className='relative mb-8'>
          <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground' />
          <Input
            placeholder={t('Search rooms...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className='pl-10 h-12 text-lg shadow-sm border-muted-foreground/20 focus-visible:ring-primary/30'
          />
        </div>

        {/* Unified Grid */}
        <div className='space-y-6 flex-1'>
          {isLoadingRooms ? (
            <RoomsSkeleton />
          ) : filteredRooms.length > 0 ? (
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
              {filteredRooms.map((r) => (
                <RoomCard
                  key={r.id}
                  room={r}
                  myMatches={myMatches[r.id]}
                  myRating={roomRating[r.id]}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title={t('No rooms found')}
              description={t("You haven't joined any rooms yet.")}
            />
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

// --- Helpers ---
function RoomsSkeleton() {
  return (
    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
      {[1, 2, 3].map((i) => (
        <div key={i} className='flex flex-col space-y-3'>
          <Skeleton className='h-[200px] w-full rounded-xl' />
          <div className='space-y-2'>
            <Skeleton className='h-4 w-[250px]' />
            <Skeleton className='h-4 w-[150px]' />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className='bg-muted/20 border-dashed border-2 flex flex-col items-center justify-center py-16 text-center'>
      <div className='bg-muted rounded-full p-4 mb-4'>
        <Search className='h-8 w-8 text-muted-foreground' />
      </div>
      <CardTitle className='text-xl mb-2'>{title}</CardTitle>
      <CardDescription className='max-w-sm mx-auto'>
        {description}
      </CardDescription>
    </Card>
  );
}