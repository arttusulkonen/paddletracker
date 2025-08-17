'use client';

import { ProtectedRoute } from '@/components/ProtectedRoutes';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { db, storage } from '@/lib/firebase';
import { getUserLite } from '@/lib/friends';
import type { TournamentRoom, UserProfile } from '@/lib/types';
import { getFinnishFormattedDate } from '@/lib/utils';
import { seedKnockoutRounds } from '@/lib/utils/bracketUtils';
import { parseFlexDate, safeFormatDate } from '@/lib/utils/date';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import {
  Image as ImageIcon,
  PlusCircle,
  SearchIcon,
  UsersIcon,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const PLAYER_COUNTS = [4, 6, 8, 12] as const;

export default function TournamentRoomsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const { sport, config, setSport } = useSport();
  const tournamentsEnabled = sport === 'pingpong';

  const [tournaments, setTournaments] = useState<TournamentRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [coPlayers, setCoPlayers] = useState<UserProfile[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [playerCount, setPlayerCount] =
    useState<(typeof PLAYER_COUNTS)[number]>(4);
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [peopleSearch, setPeopleSearch] = useState('');

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!user || !tournamentsEnabled) {
      setIsLoading(false);
      return;
    }
    const col = collection(db, 'tournament-rooms');
    const unsub = onSnapshot(
      col,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        const arrBySport = arr.filter(
          (t: any) => t.sport === sport || (!t.sport && sport === 'pingpong')
        );
        const filtered = arrBySport.filter((t) =>
          (t.participants ?? []).some((p: any) => p.userId === user.uid)
        );
        filtered.sort(
          (a: any, b: any) =>
            parseFlexDate(b.createdAt).getTime() -
            parseFlexDate(a.createdAt).getTime()
        );
        setTournaments(filtered);
        setIsLoading(false);
      },
      () => {
        toast({
          title: t('Error'),
          description: t('Could not load tournaments.'),
          variant: 'destructive',
        });
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, [user, tournamentsEnabled, sport, toast, t]);

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
    if (!user || !tournamentsEnabled) return;
    const q = query(
      collection(db, config.collections.rooms),
      where('memberIds', 'array-contains', user.uid)
    );
    const unsub = onSnapshot(q, async (snap) => {
      const idsSet = new Set<string>();
      snap.docs.forEach((d) =>
        (d.data().memberIds ?? []).forEach((uid: string) => {
          if (uid && uid !== user.uid) idsSet.add(uid);
        })
      );

      const allIds = Array.from(idsSet);
      const missingIds = allIds.filter(
        (uid) => !friends.some((f) => f.uid === uid)
      );
      const loadedMissing = await Promise.all(
        missingIds.map(async (uid) => ({ uid, ...(await getUserLite(uid)) }))
      );

      const map = new Map<string, UserProfile>();
      allIds.forEach((uid) => {
        const f = friends.find((x) => x.uid === uid);
        if (f) map.set(uid, f);
      });
      loadedMissing.forEach((p) => map.set(p.uid, p as UserProfile));

      setCoPlayers(Array.from(map.values()));
    });
    return () => unsub();
  }, [user, tournamentsEnabled, config.collections.rooms, friends]);

  const { friendsInSport, othersInSport, allCandidates } = useMemo(() => {
    const friendSet = new Set(friends.map((f) => f.uid));
    const byName = (a: UserProfile, b: UserProfile) =>
      (a.name ?? a.displayName ?? '').localeCompare(
        b.name ?? b.displayName ?? ''
      );
    const inFriends = coPlayers
      .filter((p) => friendSet.has(p.uid))
      .sort(byName);
    const notFriends = coPlayers
      .filter((p) => !friendSet.has(p.uid))
      .sort(byName);
    return {
      friendsInSport: inFriends,
      othersInSport: notFriends,
      allCandidates: [...inFriends, ...notFriends],
    };
  }, [friends, coPlayers]);

  const filterFn = (p: UserProfile) => {
    if (!peopleSearch.trim()) return true;
    const q = peopleSearch.toLowerCase();
    return (
      (p.name ?? '').toLowerCase().includes(q) ||
      (p.displayName ?? '').toLowerCase().includes(q) ||
      (p.email ?? '').toLowerCase().includes(q)
    );
  };

  const filteredFriends = useMemo(
    () => friendsInSport.filter(filterFn),
    [friendsInSport, peopleSearch]
  );
  const filteredOthers = useMemo(
    () => othersInSport.filter(filterFn),
    [othersInSport, peopleSearch]
  );

  const shuffle = <T,>(arr: T[]) =>
    arr
      .map((v) => ({ v, r: Math.random() }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.v);

  const roundRobinMatches = (arr: { userId: string; name: string }[]) => {
    const res: any[] = [];
    for (let i = 0; i < arr.length; i++)
      for (let j = i + 1; j < arr.length; j++)
        res.push({
          matchId: crypto.randomUUID(),
          name: `${arr[i].name} vs ${arr[j].name}`,
          player1: arr[i],
          player2: arr[j],
          scorePlayer1: null,
          scorePlayer2: null,
          matchStatus: 'pending',
          winner: null,
        });
    return res;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setAvatarFile(file);
    setAvatarPreview(file ? URL.createObjectURL(file) : null);
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setPlayerCount(4);
    setSelected([]);
    setAvatarFile(null);
    setAvatarPreview(null);
    setPeopleSearch('');
  };

  const createTournament = async () => {
    if (!tournamentsEnabled) {
      toast({
        title: t('Error'),
        description: t('Tournaments are not available for this sport yet.'),
        variant: 'destructive',
      });
      return;
    }
    if (!user) {
      toast({
        title: t('Error'),
        description: t('Log in'),
        variant: 'destructive',
      });
      return;
    }
    if (!name.trim()) {
      toast({
        title: t('Error'),
        description: t('Name required'),
        variant: 'destructive',
      });
      return;
    }
    if (selected.length + 1 !== playerCount) {
      toast({
        title: t('Error'),
        description: `${t('Select exactly')} ${playerCount} ${t(
          'players (including you)'
        )}`,
        variant: 'destructive',
      });
      return;
    }
    setCreating(true);
    try {
      let avatarURL = '';
      if (avatarFile) {
        const filePath = `tournament-avatars/${sport}/${Date.now()}_${
          avatarFile.name
        }`;
        const storageRef = ref(storage, filePath);
        const uploadResult = await uploadBytes(storageRef, avatarFile);
        avatarURL = await getDownloadURL(uploadResult.ref);
      }

      const now = getFinnishFormattedDate();
      const participants = shuffle([
        {
          userId: user.uid,
          name: userProfile?.name ?? userProfile?.displayName ?? '',
        },
        ...selected.map((uid) => {
          const p = allCandidates.find((c) => c.uid === uid)!;
          return { userId: uid, name: p.name ?? p.displayName ?? '' };
        }),
      ]).map((p, i) => ({ ...p, seed: i + 1 }));
      const bracket: any = {
        stage: 'inProgress',
        currentRound: 0,
        rounds: [
          {
            label: 'Round-Robin',
            type: 'roundRobin',
            roundIndex: 0,
            status: 'inProgress',
            matches: roundRobinMatches(participants),
            participants,
          },
          {
            roundIndex: 1,
            type: 'knockoutSemis',
            label: 'Semi-finals',
            status: 'pending',
            matches: [],
          },
          {
            roundIndex: 2,
            type: 'knockoutFinal',
            label: 'Finals',
            status: 'pending',
            matches: [],
          },
        ],
      };
      seedKnockoutRounds(bracket, []);
      const ref = await addDoc(collection(db, 'tournament-rooms'), {
        name: name.trim(),
        description: description.trim(),
        avatarURL,
        createdAt: now,
        creator: user.uid,
        sport,
        participants,
        bracket,
        champion: null,
        isFinished: false,
      });
      await updateDoc(doc(db, 'users', user.uid), {
        tournaments: arrayUnion(ref.id),
      });
      await Promise.all(
        selected.map((uid) =>
          updateDoc(doc(db, 'users', uid), { tournaments: arrayUnion(ref.id) })
        )
      );
      toast({ title: t('Tournament created') });
      setDialogOpen(false);
      resetForm();
      router.push(`/tournaments/${ref.id}`);
    } catch {
      toast({
        title: t('Error'),
        description: t('Failed to create'),
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const filtered = useMemo(
    () =>
      tournaments.filter((tmt) =>
        tmt.name.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [tournaments, searchTerm]
  );

  if (!hasMounted) return null;

  if (!tournamentsEnabled) {
    return (
      <ProtectedRoute>
        <div className='container mx-auto py-8 px-4'>
          <Card>
            <CardHeader>
              <CardTitle>{t('Tournaments')}</CardTitle>
              <CardDescription>
                {t('Tournaments are not available for this sport yet.')}
              </CardDescription>
            </CardHeader>
            <CardFooter className='p-6 pt-0'>
              <Button
                onClick={() => {
                  setSport?.('pingpong');
                  router.push('/tournaments');
                }}
              >
                {t('Switch to Ping-Pong to view tournaments')}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className='container mx-auto py-8 px-4'>
        <div className='flex justify-between items-center mb-6'>
          <h1 className='text-4xl font-bold flex items-center gap-2'>
            <UsersIcon className='h-8 w-8 text-primary' /> {t('Tournaments')}
          </h1>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <PlusCircle className='mr-2 h-5 w-5' /> {t('New Tournament')}
              </Button>
            </DialogTrigger>
            <DialogContent className='sm:max-w-[520px]'>
              <DialogHeader>
                <DialogTitle>{t('Create Tournament')}</DialogTitle>
                <DialogDescription>
                  {t('Give it a name, choose size and pick participants')}
                </DialogDescription>
              </DialogHeader>
              <div className='space-y-5 py-4'>
                <div className='flex flex-col items-center gap-4'>
                  <Avatar className='h-24 w-24'>
                    <AvatarImage src={avatarPreview ?? undefined} />
                    <AvatarFallback>
                      <ImageIcon className='h-10 w-10 text-muted-foreground' />
                    </AvatarFallback>
                  </Avatar>
                  <div className='flex gap-2'>
                    <Button
                      variant='outline'
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {t('Upload Image')}
                    </Button>
                    {avatarPreview && (
                      <Button
                        variant='ghost'
                        size='icon'
                        onClick={() => {
                          setAvatarFile(null);
                          setAvatarPreview(null);
                        }}
                      >
                        <X className='h-4 w-4' />
                      </Button>
                    )}
                  </div>
                  <Input
                    type='file'
                    ref={fileInputRef}
                    className='hidden'
                    accept='image/png, image/jpeg, image/webp'
                    onChange={handleFileChange}
                  />
                </div>

                <div className='grid grid-cols-4 items-center gap-4'>
                  <Label className='text-right'>{t('Name')}</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className='col-span-3'
                  />
                </div>

                <div className='grid grid-cols-4 items-center gap-4'>
                  <Label className='text-right'>{t('Description')}</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className='col-span-3'
                    placeholder={t('A brief description about this room')}
                  />
                </div>

                <div className='grid grid-cols-4 items-center gap-4'>
                  <Label className='text-right'>{t('Players')}</Label>
                  <Select
                    value={String(playerCount)}
                    onValueChange={(v) => {
                      setPlayerCount(Number(v) as any);
                      setSelected([]);
                    }}
                  >
                    <SelectTrigger className='col-span-3'>
                      <SelectValue placeholder={t('Players')} />
                    </SelectTrigger>
                    <SelectContent>
                      {PLAYER_COUNTS.map((cnt) => (
                        <SelectItem key={cnt} value={String(cnt)}>
                          {cnt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className='space-y-2'>
                  <p className='text-sm font-medium'>
                    {`${t('Select participants')} (${
                      selected.length + 1
                    }/${playerCount})`}
                  </p>
                  <Input
                    value={peopleSearch}
                    onChange={(e) => setPeopleSearch(e.target.value)}
                    placeholder={t('Search by name or creator…')}
                    className='mt-1'
                  />
                  <ScrollArea className='h-56 pr-2 mt-2 border rounded-md p-2'>
                    {filteredFriends.length + filteredOthers.length > 0 ? (
                      <>
                        {filteredFriends.length > 0 && (
                          <>
                            <div className='px-2 pt-1 pb-2 text-xs uppercase tracking-wide text-muted-foreground'>
                              {t('Friends in this sport')}
                            </div>
                            {filteredFriends.map((p) => {
                              const disabled =
                                !selected.includes(p.uid) &&
                                selected.length + 1 >= playerCount;
                              return (
                                <label
                                  key={p.uid}
                                  className={`flex items-center gap-2 py-1 ${
                                    disabled
                                      ? 'opacity-50 cursor-not-allowed'
                                      : ''
                                  }`}
                                >
                                  <Checkbox
                                    disabled={disabled}
                                    checked={selected.includes(p.uid)}
                                    onCheckedChange={(v) =>
                                      v
                                        ? setSelected([...selected, p.uid])
                                        : setSelected(
                                            selected.filter(
                                              (id) => id !== p.uid
                                            )
                                          )
                                    }
                                  />
                                  <span>{p.name ?? p.displayName}</span>
                                </label>
                              );
                            })}
                          </>
                        )}
                        {filteredOthers.length > 0 && (
                          <>
                            <div className='px-2 pt-3 pb-2 text-xs uppercase tracking-wide text-muted-foreground'>
                              {t('From your sport rooms')}
                            </div>
                            {filteredOthers.map((p) => {
                              const disabled =
                                !selected.includes(p.uid) &&
                                selected.length + 1 >= playerCount;
                              return (
                                <label
                                  key={p.uid}
                                  className={`flex items-center gap-2 py-1 ${
                                    disabled
                                      ? 'opacity-50 cursor-not-allowed'
                                      : ''
                                  }`}
                                >
                                  <Checkbox
                                    disabled={disabled}
                                    checked={selected.includes(p.uid)}
                                    onCheckedChange={(v) =>
                                      v
                                        ? setSelected([...selected, p.uid])
                                        : setSelected(
                                            selected.filter(
                                              (id) => id !== p.uid
                                            )
                                          )
                                    }
                                  />
                                  <span>{p.name ?? p.displayName}</span>
                                </label>
                              );
                            })}
                          </>
                        )}
                      </>
                    ) : (
                      <p className='text-muted-foreground'>
                        {t('You have no friends or co-players yet')}
                      </p>
                    )}
                  </ScrollArea>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createTournament} disabled={creating}>
                  {creating ? t('Creating…') : t('Create')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <Card className='shadow-lg'>
          <CardHeader>
            <div className='relative w-full max-w-md'>
              <SearchIcon className='absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground' />
              <Input
                placeholder={t('Search tournaments…')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className='pl-10 w-full'
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className='flex items-center justify-center h-40'>
                <div className='animate-spin h-12 w-12 rounded-full border-b-2 border-primary' />
              </div>
            ) : filtered.length ? (
              <ScrollArea className='h-[400px]'>
                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-1'>
                  {filtered.map((tournament) => (
                    <Card
                      key={tournament.id}
                      className='hover:shadow-md transition-shadow'
                    >
                      <CardHeader>
                        <CardTitle className='truncate'>
                          {tournament.name}
                        </CardTitle>
                        <CardDescription>
                          {t('Created:')}{' '}
                          {safeFormatDate(
                            tournament.createdAt,
                            'dd.MM.yyyy HH:mm'
                          )}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className='text-sm text-muted-foreground'>
                          {t('Participants:')}{' '}
                          {tournament.participants?.length ?? 0}
                        </p>
                        <p className='text-sm text-muted-foreground'>
                          {t('Champion:')} {tournament.champion?.name || '—'}
                        </p>
                      </CardContent>
                      <CardFooter>
                        <Button asChild className='w-full'>
                          <Link href={`/tournaments/${tournament.id}`}>
                            {t('Enter')}
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
                  ? t('No tournaments match your search')
                  : t('You are not registered in any tournaments yet')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
