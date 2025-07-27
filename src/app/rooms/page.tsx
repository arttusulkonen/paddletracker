// src/app/rooms/page.tsx
'use client';
import { ProtectedRoute } from '@/components/ProtectedRoutes';
import { CreateRoomDialog } from '@/components/rooms/CreateRoomDialog';
import { RoomCard } from '@/components/rooms/RoomCard';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  ScrollArea,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { getUserLite } from '@/lib/friends';
import type { Room, UserProfile } from '@/lib/types';
import { getFinnishFormattedDate } from '@/lib/utils';
import { parseFlexDate } from '@/lib/utils/date';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { PlusCircle, SearchIcon, UsersIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function RoomsPage() {
  const { t } = useTranslation();
  const { user, userProfile } = useAuth();
  const { sport, config } = useSport();
  const { toast } = useToast();

  const [allRooms, setAllRooms] = useState<(Room & { isFinished?: boolean })[]>(
    []
  );
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [myMatches, setMyMatches] = useState<Record<string, number>>({});
  const [roomRating, setRoomRating] = useState<Record<string, number>>({});
  const [hasMounted, setHasMounted] = useState(false);

  const [friends, setFriends] = useState<UserProfile[]>([]);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!user) {
      setIsLoadingRooms(false);
      return;
    }
    setIsLoadingRooms(true);

    const roomsCollectionName = config.collections.rooms;
    const roomsMap = new Map<string, any>();

    const processRooms = async (
      roomMap: Map<string, any>
    ): Promise<(Room & { isFinished?: boolean })[]> => {
      let list = Array.from(roomMap.values());
      const creatorIds = [
        ...new Set(list.map((r) => r.creator).filter(Boolean)),
      ];
      const creatorNameMap: Record<string, string> = {};

      if (creatorIds.length > 0) {
        const creatorDocs = await Promise.all(
          creatorIds.map((uid) => getDoc(doc(db, 'users', uid)))
        );
        creatorDocs.forEach((snap) => {
          if (snap.exists())
            creatorNameMap[snap.id] = snap.data().name || t('Unknown');
        });
      }

      const ratingMap: Record<string, number> = {};
      list.forEach((r) => {
        const me = r.members.find((m: any) => m.userId === user.uid);
        ratingMap[r.id] = me?.rating ?? 0;
      });
      setRoomRating(ratingMap);

      return list.map((data) => ({
        ...data,
        id: data.id,
        creatorName: creatorNameMap[data.creator] || data.creatorName,
        createdRaw: data.createdAt || data.roomCreated || '',
        isFinished: (data.seasonHistory?.length ?? 0) > 0,
      }));
    };

    const qMyRooms = query(
      collection(db, roomsCollectionName),
      where('memberIds', 'array-contains', user.uid)
    );
    const qPublicRooms = query(
      collection(db, roomsCollectionName),
      where('isPublic', '==', true)
    );

    const unsubMy = onSnapshot(qMyRooms, async (snap) => {
      snap.docs.forEach((d) => roomsMap.set(d.id, { id: d.id, ...d.data() }));
      const allProcessed = await processRooms(new Map(roomsMap));
      setAllRooms(allProcessed);
      setIsLoadingRooms(false);
    });

    const unsubPublic = onSnapshot(qPublicRooms, async (snap) => {
      snap.docs.forEach((d) => roomsMap.set(d.id, { id: d.id, ...d.data() }));
      const allProcessed = await processRooms(new Map(roomsMap));
      setAllRooms(allProcessed);
      setIsLoadingRooms(false);
    });

    return () => {
      unsubMy();
      unsubPublic();
    };
  }, [user, t, sport, config.collections.rooms]);

  const loadMyCounts = useCallback(
    async (roomsToLoad: Room[]) => {
      if (!user || !roomsToLoad.length) return;
      const matchesCollectionName = config.collections.matches;
      const res: Record<string, number> = {};
      await Promise.all(
        roomsToLoad.map(async (r) => {
          const q = query(
            collection(db, matchesCollectionName),
            where('roomId', '==', r.id),
            where('players', 'array-contains', user.uid)
          );
          const snap = await getDocs(q);
          res[r.id] = snap.size;
        })
      );
      setMyMatches((prev) => ({ ...prev, ...res }));
    },
    [user, config.collections.matches]
  );

  useEffect(() => {
    if (allRooms.length > 0) {
      loadMyCounts(allRooms);
    }
  }, [allRooms, loadMyCounts]);

  // Friend/Co-player logic for create dialog
  useEffect(() => {
    if (!user) return;
    const unsubFriends = onSnapshot(
      doc(db, 'users', user.uid),
      async (snap) => {
        if (!snap.exists()) return setFriends([]);
        const ids: string[] = snap.data().friends ?? [];
        const loaded = await Promise.all(
          ids.map(async (uid) => ({ uid, ...(await getUserLite(uid)) }))
        );
        setFriends(loaded.filter(Boolean) as UserProfile[]);
      }
    );
    return () => unsubFriends();
  }, [user]);

  const inviteCandidates = useMemo(() => {
    return friends.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  }, [friends]);

  const handleCreateRoom = async () => {
    // Logic from your provided component
    if (!user || !userProfile || !roomName.trim()) {
      toast({
        title: t('Error'),
        description: t('Room name cannot be empty'),
        variant: 'destructive',
      });
      return;
    }
    setIsCreatingRoom(true);
    try {
      const now = getFinnishFormattedDate();
      const initialMembers = [
        {
          userId: user.uid,
          name: userProfile.name ?? userProfile.displayName ?? '',
          email: userProfile.email ?? '',
          rating: 1000,
          wins: 0,
          losses: 0,
          date: now,
          role: 'admin' as const,
        },
        ...selectedFriends.map((uid) => {
          const f = inviteCandidates.find((x) => x.uid === uid)!;
          return {
            userId: uid,
            name: f.name ?? f.displayName ?? '',
            email: f.email ?? '',
            rating: 1000,
            wins: 0,
            losses: 0,
            date: now,
            role: 'editor' as const,
          };
        }),
      ];
      await addDoc(collection(db, config.collections.rooms), {
        name: roomName.trim(),
        creator: user.uid,
        creatorName: userProfile.name ?? userProfile.displayName ?? '',
        createdAt: now,
        members: initialMembers,
        isPublic,
        isRanked,
        memberIds: [user.uid, ...selectedFriends],
        isArchived: false,
      });
      toast({
        title: t('Success'),
        description: `${t('Room')} "${roomName.trim()}" ${t('created')}`,
      });
      setRoomName('');
      setSelectedFriends([]);
      setIsPublic(false);
      setIsRanked(true);
    } catch (e) {
      toast({
        title: t('Error'),
        description: t('Failed to create room'),
        variant: 'destructive',
      });
    } finally {
      setIsCreatingRoom(false);
    }
  };

  // ✅ Улучшенная логика фильтрации и сортировки
  const displayRooms = useMemo(() => {
    const filtered = allRooms.filter(
      (r) =>
        r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.creatorName ?? '').toLowerCase().includes(searchTerm.toLowerCase())
    );
    // Сортировка: Сначала активные, потом завершенные, потом архивные
    return filtered.sort((a, b) => {
      const getScore = (r: Room & { isFinished?: boolean }) => {
        if (r.isArchived) return 2;
        if (r.isFinished) return 1;
        return 0;
      };
      return getScore(a) - getScore(b);
    });
  }, [allRooms, searchTerm]);

  if (!hasMounted) return null;

  return (
    <ProtectedRoute>
      <div className='container mx-auto py-8 px-4'>
        <div className='flex flex-col sm:flex-row justify-between items-center mb-8 gap-4'>
          <h1 className='text-4xl font-bold flex items-center gap-2'>
            <UsersIcon className='h-10 w-10 text-primary' />
            {t('Match Rooms')} ({config.name})
          </h1>
          <CreateRoomDialog />
        </div>
        <Card className='mb-8 shadow-lg'>
          <CardHeader>
            <CardTitle>{t('Your Rooms')}</CardTitle>
            <CardDescription>
              {t('Click a card to enter and record matches')}
            </CardDescription>
            <div className='relative mt-4'>
              <SearchIcon className='absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground' />
              <Input
                placeholder={t('Search by name or creator…')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className='pl-10 w-full max-w-md'
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingRooms ? (
              <div className='flex items-center justify-center h-40'>
                <div className='animate-spin h-12 w-12 rounded-full border-b-2 border-primary' />
              </div>
            ) : displayRooms.length > 0 ? (
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-1'>
                {displayRooms.map((r) => (
                  <RoomCard
                    key={r.id}
                    room={r}
                    myMatches={myMatches[r.id]}
                    myRating={roomRating[r.id]}
                  />
                ))}
              </div>
            ) : (
              <p className='text-center text-muted-foreground py-8'>
                {searchTerm
                  ? t('No rooms match your search')
                  : t('You are not a member of any rooms yet')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
