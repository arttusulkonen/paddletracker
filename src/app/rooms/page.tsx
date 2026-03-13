// src/app/rooms/page.tsx
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
        +(timeParts[2] || 0),
      );
      if (!isNaN(d.getTime())) return d.getTime();
    }
  }
  const iso = Date.parse(str);
  if (!isNaN(iso)) return iso;
  return 0;
};

type RoomWithMeta = Room & {
  isFinished?: boolean;
  creatorName?: string;
  _sortTs: number;
  communityId?: string | null;
  communityName?: string;
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

  useEffect(() => {
    if (!user || !db) {
      setIsLoadingRooms(false);
      return;
    }
    setIsLoadingRooms(true);

    const roomsCollectionName = config.collections.rooms;
    const roomsMap = new Map<string, DocumentData>();

    const processRooms = async (
      rawMap: Map<string, DocumentData>,
    ): Promise<RoomWithMeta[]> => {
      const list = Array.from(rawMap.values());

      const creatorIds = [
        ...new Set(
          list
            .map((r) => r.creator || r.createdBy)
            .filter((id): id is string => !!id),
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
          }),
        );
      }

      const communityIds = [
        ...new Set(
          list.map((r) => r.communityId).filter((id): id is string => !!id),
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
          }),
        );
      }

      const ratingMap: Record<string, number> = {};
      list.forEach((r) => {
        const members = r.members || [];
        const me = members.find((m: any) => m.userId === user.uid);
        ratingMap[r.id] = me?.rating ?? 0;
      });
      setRoomRating(ratingMap);

      return list.map((data) => {
        const creatorId = data.creator || data.createdBy;
        const isFinished =
          (data.seasonHistory?.length ?? 0) > 0 || data.isArchived === true;

        return {
          ...(data as Room),
          id: data.id,
          creatorName: creatorNameMap[creatorId] || data.creatorName,
          isFinished: isFinished,
          _sortTs: parseRoomDate(
            data.createdAt || data.roomCreated || data.created,
          ),
          communityId: data.communityId || null,
          communityName: data.communityId
            ? communityNameMap[data.communityId]
            : undefined,
        };
      });
    };

    const qMyRooms = query(
      collection(db!, roomsCollectionName),
      where('memberIds', 'array-contains', user.uid),
    );

    const handleSnapshot = async (snap: { docs: DocumentData[] }) => {
      snap.docs.forEach((d) => roomsMap.set(d.id, { id: d.id, ...d.data() }));
      const processed = await processRooms(new Map(roomsMap));

      processed.sort((a, b) => {
        if (a.isFinished !== b.isFinished) {
          return a.isFinished ? 1 : -1;
        }
        return b._sortTs - a._sortTs;
      });

      setAllRooms(processed);
      setIsLoadingRooms(false);
    };

    const unsubMy = onSnapshot(qMyRooms, handleSnapshot as any);
    return () => unsubMy();
  }, [user, t, config.collections.rooms]);

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
            where('players', 'array-contains', user.uid),
          );
          const snap = await getDocs(qy);
          res[r.id] = snap.size;
        }),
      );

      if (Object.keys(res).length > 0) {
        setMyMatches((prev) => ({ ...prev, ...res }));
      }
    },
    [user, config.collections.matches, myMatches],
  );

  useEffect(() => {
    if (allRooms.length > 0) {
      const myMemberRooms = allRooms.filter((r) =>
        r.memberIds?.includes(user?.uid || ''),
      );
      loadMyCounts(myMemberRooms);
    }
  }, [allRooms, loadMyCounts, user]);

  const filteredRooms = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return allRooms.filter(
      (r) =>
        r.name.toLowerCase().includes(lowerSearch) ||
        (r.creatorName ?? '').toLowerCase().includes(lowerSearch) ||
        (r.communityName ?? '').toLowerCase().includes(lowerSearch),
    );
  }, [allRooms, searchTerm]);

  const canCreateRoom = userProfile && !userProfile.isGhost;

  if (!hasMounted) return null;

  return (
    <ProtectedRoute>
      <div className='container mx-auto py-10 md:py-14 px-4 min-h-screen flex flex-col animate-in fade-in duration-700'>
        <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10'>
          <div className='flex items-center gap-5'>
            <div className='bg-primary/10 p-4 rounded-2xl ring-1 ring-primary/20 shadow-sm'>
              <Users className='h-8 w-8 text-primary' />
            </div>
            <div>
              <h1 className='text-4xl md:text-5xl font-extrabold tracking-tight text-foreground'>
                {t('Match Rooms')}
              </h1>
              <p className='text-muted-foreground mt-2 text-lg font-light leading-relaxed'>
                {t('Join a club or create your own league.')}
              </p>
            </div>
          </div>
          {canCreateRoom && <CreateRoomDialog />}
        </div>

        <div className='relative mb-10 group'>
          <div className='absolute -inset-0.5 bg-gradient-to-r from-primary/30 to-purple-600/30 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-500'></div>
          <div className='relative flex items-center'>
            <Search className='absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground z-10' />
            <Input
              placeholder={t('Search rooms...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className='pl-12 h-14 text-lg border-0 shadow-xl rounded-2xl glass-panel focus-visible:ring-2 focus-visible:ring-primary/40 transition-all w-full relative z-0'
            />
          </div>
        </div>

        <div className='space-y-6 flex-1'>
          {isLoadingRooms ? (
            <RoomsSkeleton />
          ) : filteredRooms.length > 0 ? (
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'>
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

function RoomsSkeleton() {
  return (
    <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'>
      {[1, 2, 3].map((i) => (
        <div key={i} className='flex flex-col space-y-4'>
          <Skeleton className='h-[240px] w-full rounded-[2rem] shadow-sm' />
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
    <Card className='border-0 shadow-xl rounded-[2.5rem] glass-panel flex flex-col items-center justify-center py-24 text-center mt-4'>
      <div className='bg-primary/10 rounded-full p-6 mb-6 ring-1 ring-primary/20'>
        <Search className='h-10 w-10 text-primary opacity-80' />
      </div>
      <CardTitle className='text-2xl font-extrabold tracking-tight mb-3'>
        {title}
      </CardTitle>
      <CardDescription className='max-w-sm mx-auto text-base font-light'>
        {description}
      </CardDescription>
    </Card>
  );
}
