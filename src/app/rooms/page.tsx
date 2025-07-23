'use client';

import { ProtectedRoute } from '@/components/ProtectedRoutes';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { getUserLite } from '@/lib/friends';
import type { Room, UserProfile } from '@/lib/types';
import { getFinnishFormattedDate } from '@/lib/utils';
import { parseFlexDate, safeFormatDate } from '@/lib/utils/date';
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
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const normalizeDateStr = (str: string) =>
  str.includes(' ') ? str : `${str} 00.00.00`;

export default function RoomsPage() {
  const { t } = useTranslation();
  const { user, userProfile } = useAuth();
  const { toast } = useToast();

  const [roomName, setRoomName] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  const [activeRooms, setActiveRooms] = useState<Room[]>([]);
  const [archivedRooms, setArchivedRooms] = useState<Room[]>([]);
  const [allRooms, setAllRooms] = useState<Room[]>([]);

  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [coPlayers, setCoPlayers] = useState<UserProfile[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [myMatches, setMyMatches] = useState<Record<string, number>>({});
  const [isPublic, setIsPublic] = useState(false);
  const [isRanked, setIsRanked] = useState(true); // <-- НОВОЕ СОСТОЯНИЕ
  const [roomRating, setRoomRating] = useState<Record<string, number>>({});
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!user) {
      setIsLoadingRooms(false);
      return;
    }
    setIsLoadingRooms(true);

    const processRooms = async (roomMap: Map<string, any>): Promise<Room[]> => {
      let list = Array.from(roomMap.values());

      list = list.map((data) => ({
        ...data,
        createdRaw: data.createdAt || data.roomCreated || '',
      }));

      list.sort((a, b) => {
        const da = parseFlexDate(normalizeDateStr(a.createdRaw));
        const db = parseFlexDate(normalizeDateStr(b.createdRaw));
        return db.getTime() - da.getTime();
      });

      const missingCreators = Array.from(
        new Set(list.filter((r) => !r.creatorName).map((r) => r.creator!))
      );

      if (missingCreators.length > 0) {
        const creatorNameMap: Record<string, string> = {};
        await Promise.all(
          missingCreators.map(async (uid) => {
            const s = await getDoc(doc(db, 'users', uid));
            if (s.exists())
              creatorNameMap[uid] = (s.data() as any).name || t('Unknown');
          })
        );
        list = list.map((r) =>
          !r.creatorName && r.creator && creatorNameMap[r.creator]
            ? { ...r, creatorName: creatorNameMap[r.creator] }
            : r
        );
      }

      const ratingMap: Record<string, number> = {};
      list.forEach((r) => {
        const me = r.members.find((m: any) => m.userId === user.uid);
        ratingMap[r.id] = me?.rating ?? 0;
      });
      setRoomRating((prev) => ({ ...prev, ...ratingMap }));

      return list as Room[];
    };

    const roomsMap = new Map<string, any>();

    const qMyRooms = query(
      collection(db, 'rooms'),
      where('memberIds', 'array-contains', user.uid)
    );
    const qPublicRooms = query(
      collection(db, 'rooms'),
      where('isPublic', '==', true)
    );

    const unsubMy = onSnapshot(qMyRooms, async (snap) => {
      snap.docs.forEach((d) => roomsMap.set(d.id, { id: d.id, ...d.data() }));
      const allProcessed = await processRooms(new Map(roomsMap));
      setActiveRooms(allProcessed.filter((r) => !r.isArchived));
      setArchivedRooms(allProcessed.filter((r) => r.isArchived));
      setAllRooms(allProcessed);
      setIsLoadingRooms(false);
    });

    const unsubPublic = onSnapshot(qPublicRooms, async (snap) => {
      snap.docs.forEach((d) => roomsMap.set(d.id, { id: d.id, ...d.data() }));
      const allProcessed = await processRooms(new Map(roomsMap));
      setActiveRooms(allProcessed.filter((r) => !r.isArchived));
      setArchivedRooms(allProcessed.filter((r) => r.isArchived));
      setAllRooms(allProcessed);
      setIsLoadingRooms(false);
    });

    return () => {
      unsubMy();
      unsubPublic();
    };
  }, [user, t]);

  const loadMyCounts = useCallback(
    async (roomsToLoad: Room[]) => {
      if (!user || !roomsToLoad.length) return;
      const res: Record<string, number> = {};
      await Promise.all(
        roomsToLoad.map(async (r) => {
          const [s1, s2] = await Promise.all([
            getDocs(
              query(
                collection(db, 'matches'),
                where('roomId', '==', r.id),
                where('player1Id', '==', user.uid)
              )
            ),
            getDocs(
              query(
                collection(db, 'matches'),
                where('roomId', '==', r.id),
                where('player2Id', '==', user.uid)
              )
            ),
          ]);
          res[r.id] = s1.size + s2.size;
        })
      );
      setMyMatches((prev) => ({ ...prev, ...res }));
    },
    [user]
  );

  useEffect(() => {
    if (allRooms.length) {
      loadMyCounts(allRooms);
    }
  }, [allRooms, loadMyCounts]);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), async (snap) => {
      if (!snap.exists()) return setFriends([]);
      const ids: string[] = snap.data().friends ?? [];
      const loaded = await Promise.all(
        ids.map(async (uid) => ({ uid, ...(await getUserLite(uid)) }))
      );
      setFriends(loaded);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user || !allRooms.length) return;
    const loadCoPlayers = async () => {
      const unionIds = new Set<string>();
      allRooms.forEach((r) =>
        (r.memberIds ?? []).forEach(
          (id: string) => id !== user.uid && unionIds.add(id)
        )
      );
      const toLoad = Array.from(unionIds).filter(
        (uid) => !friends.some((f) => f.uid === uid)
      );
      const loaded = await Promise.all(
        toLoad.map(async (uid) => ({ uid, ...(await getUserLite(uid)) }))
      );
      setCoPlayers(loaded);
    };
    loadCoPlayers();
  }, [allRooms, friends, user]);

  const inviteCandidates = useMemo(() => {
    const map = new Map<string, UserProfile>();
    [...friends, ...coPlayers].forEach((p) => map.set(p.uid, p));
    return Array.from(map.values()).sort((a, b) =>
      (a.name ?? a.displayName ?? '').localeCompare(
        b.name ?? b.displayName ?? ''
      )
    );
  }, [friends, coPlayers]);

  const handleCreateRoom = async () => {
    if (!user || !userProfile) {
      toast({
        title: t('Error'),
        description: t('Log in to create a room'),
        variant: 'destructive',
      });
      return;
    }
    if (!roomName.trim()) {
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
      const ref = await addDoc(collection(db, 'rooms'), {
        name: roomName.trim(),
        creator: user.uid,
        creatorName: userProfile.name ?? userProfile.displayName ?? '',
        createdAt: now,
        members: initialMembers,
        isPublic,
        isRanked, // <-- ИЗМЕНЕНИЕ
        memberIds: [user.uid, ...selectedFriends],
        isArchived: false,
      });
      await updateDoc(doc(db, 'users', user.uid), {
        rooms: arrayUnion(ref.id),
      });
      await Promise.all(
        selectedFriends.map((uid) =>
          updateDoc(doc(db, 'users', uid), { rooms: arrayUnion(ref.id) })
        )
      );
      toast({
        title: t('Success'),
        description: `${t('Room')} "${roomName.trim()}" ${t('created')}`,
      });
      setRoomName('');
      setSelectedFriends([]);
      setIsPublic(false);
      setIsRanked(true); // <-- СБРОС СОСТОЯНИЯ
    } catch {
      toast({
        title: t('Error'),
        description: t('Failed to create room'),
        variant: 'destructive',
      });
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const filteredActiveRooms = useMemo(
    () =>
      activeRooms.filter(
        (r) =>
          r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (r.creatorName ?? '').toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [activeRooms, searchTerm]
  );

  const filteredArchivedRooms = useMemo(
    () =>
      archivedRooms.filter(
        (r) =>
          r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (r.creatorName ?? '').toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [archivedRooms, searchTerm]
  );

  if (!hasMounted) {
    return null;
  }

  return (
    <ProtectedRoute>
      <div className='container mx-auto py-8 px-4'>
        <div className='flex flex-col sm:flex-row justify-between items-center mb-8 gap-4'>
          <h1 className='text-4xl font-bold flex items-center gap-2'>
            <UsersIcon className='h-10 w-10 text-primary' />
            {t('Match Rooms')}
          </h1>
          <Dialog>
            <DialogTrigger asChild>
              <Button size='lg'>
                <PlusCircle className='mr-2 h-5 w-5' />
                {t('Create New Room')}
              </Button>
            </DialogTrigger>
            <DialogContent className='sm:max-w-[425px]'>
              <DialogHeader>
                <DialogTitle>{t('Create a Match Room')}</DialogTitle>
                <DialogDescription>
                  {t(
                    'Give your room a name and invite friends or past teammates.'
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className='space-y-4 py-4'>
                <div className='grid grid-cols-4 items-center gap-4'>
                  <Label htmlFor='roomName' className='text-right'>
                    {t('Name')}
                  </Label>
                  <Input
                    id='roomName'
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    className='col-span-3'
                    placeholder={t('Office Ping Pong Champs')}
                  />
                </div>
                <div className='flex items-center space-x-2'>
                  <Checkbox
                    id='isPublic'
                    checked={isPublic}
                    onCheckedChange={(checked) => setIsPublic(Boolean(checked))}
                  />
                  <Label htmlFor='isPublic'>{t('Make room public?')}</Label>
                </div>
                <div className='flex items-start space-x-2'>
                  <Checkbox
                    id='isRanked'
                    checked={isRanked}
                    onCheckedChange={(checked) => setIsRanked(Boolean(checked))}
                  />
                  <div className='grid gap-1.5 leading-none'>
                    <Label htmlFor='isRanked'>{t('Ranked Room')}</Label>
                    <p className='text-xs text-muted-foreground'>
                      {t("Matches will affect players' global ELO.")}
                    </p>
                  </div>
                </div>
                <p className='text-sm font-medium'>{t('Invite players:')}</p>
                <ScrollArea className='h-40 pr-2'>
                  {inviteCandidates.length ? (
                    inviteCandidates.map((p) => (
                      <label
                        key={p.uid}
                        className='flex items-center gap-2 py-1'
                      >
                        <Checkbox
                          checked={selectedFriends.includes(p.uid)}
                          onCheckedChange={(v) =>
                            v
                              ? setSelectedFriends([...selectedFriends, p.uid])
                              : setSelectedFriends(
                                  selectedFriends.filter((id) => id !== p.uid)
                                )
                          }
                        />
                        <span>{p.name ?? p.displayName}</span>
                      </label>
                    ))
                  ) : (
                    <p className='text-muted-foreground'>
                      {t('No friends or co-players yet')}
                    </p>
                  )}
                </ScrollArea>
              </div>
              <DialogFooter>
                <Button onClick={handleCreateRoom} disabled={isCreatingRoom}>
                  {isCreatingRoom ? t('Creating…') : t('Create')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
            ) : filteredActiveRooms.length > 0 ||
              filteredArchivedRooms.length > 0 ? (
              <ScrollArea>
                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-1'>
                  {filteredActiveRooms.map((r) => (
                    <Card
                      key={r.id}
                      className='hover:shadow-md transition-shadow'
                    >
                      <CardHeader>
                        <div className='flex justify-between items-start'>
                          <CardTitle className='truncate'>{r.name}</CardTitle>
                          <Badge variant={r.isPublic ? 'default' : 'secondary'}>
                            {r.isPublic ? t('Public') : t('Private')}
                          </Badge>
                        </div>
                        <CardDescription>
                          {t('Created by:')} {r.creatorName}
                        </CardDescription>
                        <CardDescription>
                          {t('Created:')}{' '}
                          {r.createdRaw
                            ? safeFormatDate(
                                normalizeDateStr(r.createdRaw),
                                'dd.MM.yyyy'
                              )
                            : r.roomCreated}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className='text-sm text-muted-foreground'>
                          {t('Members', { context: 'cardLabel' })}{' '}
                          {r.members.length}
                        </p>
                        {r.memberIds.includes(user!.uid) && (
                          <>
                            <p className='text-sm text-muted-foreground'>
                              {t('Matches played:')} {myMatches[r.id] ?? '–'}
                            </p>
                            <p className='text-sm text-muted-foreground'>
                              {t('Your rating:')} {roomRating[r.id] ?? '–'}
                            </p>
                          </>
                        )}
                      </CardContent>
                      <CardFooter>
                        <Button asChild className='w-full'>
                          <Link href={`/rooms/${r.id}`}>{t('Enter Room')}</Link>
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                  {filteredArchivedRooms.map((r) => (
                    <Card key={r.id} className='opacity-60 bg-muted/50'>
                      <CardHeader>
                        <div className='flex justify-between items-start'>
                          <CardTitle className='truncate'>{r.name}</CardTitle>
                          <Badge variant={'outline'}>{t('Archived')}</Badge>
                        </div>
                        <CardDescription>
                          {t('Created by:')} {r.creatorName}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className='text-sm text-muted-foreground'>
                          {t('Members', { context: 'cardLabel' })}:{' '}
                          {r.members.length}
                        </p>
                      </CardContent>
                      <CardFooter>
                        <Button asChild className='w-full' variant='secondary'>
                          <Link href={`/rooms/${r.id}`}>
                            {t('View History')}
                          </Link>
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
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
