// src/app/tournaments/page.tsx
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
	CardFooter, // Added missing import
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Tabs,
	TabsList,
	TabsTrigger,
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
	Calendar,
	CheckCircle2,
	Clock,
	Crown,
	Image as ImageIcon,
	PlusCircle,
	Search,
	SearchIcon,
	Trophy,
	Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const PLAYER_COUNTS = [4, 6, 8, 12] as const;

// Define a local extended type to handle properties missing in the global TournamentRoom type
type ExtendedTournament = TournamentRoom & {
  sport?: string;
  createdAt: string;
  isFinished?: boolean;
  champion?: { name: string } | null;
  participants?: any[];
  participantsIds?: string[];
};

// Безопасная генерация UUID для любых сред (включая HTTP LAN)
function generateUUID() {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  // Fallback для небезопасных контекстов
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function TournamentRoomsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const { sport, config, setSport } = useSport();
  const tournamentsEnabled = sport === 'pingpong';

  const [tournaments, setTournaments] = useState<ExtendedTournament[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'finished'
  >('active');

  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [coPlayers, setCoPlayers] = useState<UserProfile[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);

  // Create Form State
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

  useEffect(() => setHasMounted(true), []);

  // Загрузка турниров
  useEffect(() => {
    if (!user || !tournamentsEnabled || !db) {
      setIsLoading(false);
      return;
    }
    const col = collection(db, 'tournament-rooms');
    const qSub = query(
      col,
      where('participantsIds', 'array-contains', user.uid)
    );
    const unsub = onSnapshot(
      qSub,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        // Фильтрация по спорту (для обратной совместимости)
        const arrBySport = arr.filter(
          (t: any) => t.sport === sport || (!t.sport && sport === 'pingpong')
        );
        // Сортировка: сначала новые
        arrBySport.sort(
          (a: any, b: any) =>
            parseFlexDate(b.createdAt).getTime() -
            parseFlexDate(a.createdAt).getTime()
        );
        setTournaments(arrBySport as ExtendedTournament[]);
        setIsLoading(false);
      },
      (err) => {
        console.error(err);
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

  // Загрузка друзей (только активных)
  useEffect(() => {
    if (!user || !db) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), async (snap) => {
      if (!snap.exists()) return setFriends([]);
      const ids: string[] = snap.data().friends ?? [];
      const loaded = await Promise.all(
        ids.map(async (uid) => ({ uid, ...(await getUserLite(uid)) }))
      );
      // Фильтруем удаленных
      const activeFriends = loaded.filter(
        (u) => u && !u.isDeleted
      ) as UserProfile[];
      setFriends(activeFriends);
    });
    return () => unsub();
  }, [user]);

  // Загрузка со-игроков из комнат (только активных)
  useEffect(() => {
    if (!user || !tournamentsEnabled || !db) return;

    // Используем только комнаты ТЕКУЩЕГО спорта
    const qRooms = query(
      collection(db, config.collections.rooms),
      where('memberIds', 'array-contains', user.uid)
    );
    const unsub = onSnapshot(qRooms, async (snap) => {
      const idsSet = new Set<string>();
      snap.docs.forEach((d) =>
        (d.data().memberIds ?? []).forEach((uid: string) => {
          if (uid && uid !== user.uid) idsSet.add(uid);
        })
      );

      const allIds = Array.from(idsSet);
      // Исключаем тех, кто уже в друзьях
      const missingIds = allIds.filter(
        (uid) => !friends.some((f) => f.uid === uid)
      );

      const loadedMissing = await Promise.all(
        missingIds.map(async (uid) => ({ uid, ...(await getUserLite(uid)) }))
      );

      // Собираем мапу для уникальности
      const map = new Map<string, UserProfile>();

      // Добавляем загруженных (проверяя на удаление)
      loadedMissing.forEach((p) => {
        if (p && !p.isDeleted) {
          map.set(p.uid, p as UserProfile);
        }
      });

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

    // Друзья (уже отфильтрованы по isDeleted)
    const inFriends = friends.sort(byName);

    // Остальные (уже отфильтрованы по isDeleted и не друзья)
    const notFriends = coPlayers
      .filter((p) => !friendSet.has(p.uid))
      .sort(byName);

    return {
      friendsInSport: inFriends,
      othersInSport: notFriends,
      allCandidates: [...inFriends, ...notFriends],
    };
  }, [friends, coPlayers]);

  const filterFn = useCallback(
    (p: UserProfile) => {
      if (!peopleSearch.trim()) return true;
      const q = peopleSearch.toLowerCase();
      return (
        (p.name ?? '').toLowerCase().includes(q) ||
        (p.displayName ?? '').toLowerCase().includes(q) ||
        (p.email ?? '').toLowerCase().includes(q)
      );
    },
    [peopleSearch]
  );

  const filteredFriends = useMemo(
    () => friendsInSport.filter(filterFn),
    [friendsInSport, filterFn]
  );
  const filteredOthers = useMemo(
    () => othersInSport.filter(filterFn),
    [othersInSport, filterFn]
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
          matchId: generateUUID(),
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
    // FIX: Added !storage check here to satisfy TypeScript
    if (!tournamentsEnabled || !db || !storage) return;

    if (!user) {
      toast({
        title: t('Error'),
        description: t('Log in required'),
        variant: 'destructive',
      });
      return;
    }
    if (!name.trim()) {
      toast({
        title: t('Error'),
        description: t('Tournament name required'),
        variant: 'destructive',
      });
      return;
    }
    if (selected.length + 1 !== playerCount) {
      toast({
        title: t('Error'),
        description: t('Select exactly {{count}} players (including you)', {
          count: playerCount,
        }),
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
        // Now TypeScript knows 'storage' is not null because of the check at the top
        const storageRef = ref(storage, filePath);
        const uploadResult = await uploadBytes(storageRef, avatarFile);
        avatarURL = await getDownloadURL(uploadResult.ref);
      }

      const now = getFinnishFormattedDate();
      const participants = shuffle([
        {
          userId: user.uid,
          name: userProfile?.name ?? userProfile?.displayName ?? 'Me',
        },
        ...selected.map((uid) => {
          const p = allCandidates.find((c) => c.uid === uid)!;
          return { userId: uid, name: p.name ?? p.displayName ?? 'Guest' };
        }),
      ]).map((p, i) => ({ ...p, seed: i + 1 }));

      const participantsIds = participants.map((p) => p.userId);

      const bracket: any = {
        stage: 'inProgress',
        currentRound: 0,
        rounds: [
          {
            label: 'Group Stage',
            type: 'roundRobin',
            roundIndex: 0,
            status: 'inProgress',
            matches: roundRobinMatches(participants),
            participants,
          },
          {
            roundIndex: 1,
            type: 'knockoutSemis',
            label: 'Semi-Finals',
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

      seedKnockoutRounds(bracket);

      const refDoc = await addDoc(collection(db, 'tournament-rooms'), {
        name: name.trim(),
        description: description.trim(),
        avatarURL,
        createdAt: now,
        creator: user.uid,
        sport,
        participants,
        participantsIds,
        bracket,
        champion: null,
        isFinished: false,
      });

      const allIdsToUpdate = [user.uid, ...selected];
      await Promise.all(
        allIdsToUpdate.map((uid) =>
          updateDoc(doc(db!, 'users', uid), {
            tournaments: arrayUnion(refDoc.id),
          })
        )
      );

      toast({ title: t('Tournament created successfully!') });
      setDialogOpen(false);
      resetForm();
      router.push(`/tournaments/${refDoc.id}`);
    } catch (error) {
      console.error(error);
      toast({
        title: t('Error'),
        description: t('Failed to create tournament'),
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const filteredTournaments = useMemo(() => {
    let list = tournaments;

    if (statusFilter === 'active') {
      list = list.filter((t) => !t.isFinished);
    } else if (statusFilter === 'finished') {
      list = list.filter((t) => t.isFinished);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q));
    }
    return list;
  }, [tournaments, statusFilter, searchTerm]);

  if (!hasMounted) return null;

  if (!tournamentsEnabled) {
    return (
      <ProtectedRoute>
        <div className='container mx-auto py-8 px-4 max-w-4xl'>
          <Card className='bg-muted/30 border-dashed'>
            <CardHeader className='text-center py-10'>
              <Trophy className='h-12 w-12 text-muted-foreground mx-auto mb-4' />
              <CardTitle>{t('Tournaments Unavailable')}</CardTitle>
              <CardDescription>
                {t('Tournaments are currently available only for Ping-Pong.')}
              </CardDescription>
            </CardHeader>
            <CardFooter className='justify-center pb-10'>
              <Button
                variant='default'
                onClick={() => {
                  setSport?.('pingpong');
                  router.push('/tournaments');
                }}
              >
                {t('Switch to Ping-Pong')}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className='container mx-auto py-8 px-4 max-w-6xl min-h-screen'>
        {/* Header Section */}
        <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8'>
          <div>
            <h1 className='text-4xl font-extrabold tracking-tight flex items-center gap-3'>
              <Trophy className='h-9 w-9 text-amber-500' />
              {t('Tournaments')}
            </h1>
            <p className='text-muted-foreground mt-1 text-lg'>
              {t('Compete for the championship.')}
            </p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size='lg' className='shadow-md'>
                <PlusCircle className='mr-2 h-5 w-5' /> {t('New Tournament')}
              </Button>
            </DialogTrigger>
            <DialogContent className='w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:max-w-[600px] flex flex-col p-0 overflow-hidden'>
              <DialogHeader className='px-6 pt-6 flex-shrink-0'>
                <DialogTitle>{t('Create Tournament')}</DialogTitle>
                <DialogDescription>
                  {t('Setup your bracket and invite players.')}
                </DialogDescription>
              </DialogHeader>

              {/* MAIN SCROLLABLE CONTENT (Native Scroll) */}
              <div className='flex-1 overflow-y-auto px-6 py-4'>
                <div className='space-y-6'>
                  {/* Avatar Upload */}
                  <div className='flex flex-col items-center gap-4'>
                    <div
                      className='relative group cursor-pointer'
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Avatar className='h-24 w-24 border-2 border-dashed border-muted-foreground/50 group-hover:border-primary transition-colors'>
                        <AvatarImage
                          src={avatarPreview ?? undefined}
                          className='object-cover'
                        />
                        <AvatarFallback className='bg-transparent'>
                          <ImageIcon className='h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors' />
                        </AvatarFallback>
                      </Avatar>
                      <div className='absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium'>
                        {t('Change')}
                      </div>
                    </div>
                    {avatarPreview && (
                      <Button
                        variant='ghost'
                        size='sm'
                        className='text-destructive hover:text-destructive h-8'
                        onClick={(e) => {
                          e.stopPropagation();
                          setAvatarFile(null);
                          setAvatarPreview(null);
                          if (fileInputRef.current)
                            fileInputRef.current.value = '';
                        }}
                      >
                        {t('Remove')}
                      </Button>
                    )}
                    <Input
                      type='file'
                      ref={fileInputRef}
                      className='hidden'
                      accept='image/png, image/jpeg, image/webp'
                      onChange={handleFileChange}
                    />
                  </div>

                  {/* Basic Info */}
                  <div className='space-y-4'>
                    <div className='space-y-2'>
                      <Label>{t('Tournament Name')}</Label>
                      <Input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t('e.g. Summer Cup 2025')}
                      />
                    </div>
                    <div className='space-y-2'>
                      <Label>{t('Description (Optional)')}</Label>
                      <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={t('Prize pool, location, rules...')}
                        className='resize-none h-20'
                      />
                    </div>
                  </div>

                  {/* Players Selection */}
                  <div className='space-y-4'>
                    <div className='flex justify-between items-center'>
                      <Label>{t('Number of Players')}</Label>
                      <Select
                        value={String(playerCount)}
                        onValueChange={(v) => {
                          setPlayerCount(Number(v) as any);
                          setSelected([]);
                        }}
                      >
                        <SelectTrigger className='w-[140px]'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PLAYER_COUNTS.map((cnt) => (
                            <SelectItem key={cnt} value={String(cnt)}>
                              {cnt} {t('Players')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className='border rounded-lg p-3 bg-muted/10'>
                      <div className='flex justify-between items-center mb-3'>
                        <Label className='text-xs uppercase text-muted-foreground font-bold'>
                          {t('Participants')} ({selected.length + 1}/
                          {playerCount})
                        </Label>
                        <span className='text-xs text-muted-foreground'>
                          {t('You included')}
                        </span>
                      </div>

                      <div className='relative mb-3'>
                        <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
                        <Input
                          value={peopleSearch}
                          onChange={(e) => setPeopleSearch(e.target.value)}
                          placeholder={t('Filter players...')}
                          className='pl-9 h-9'
                        />
                      </div>

                      {/* Player List - Native Scroll without inner ScrollArea */}
                      <div className='mt-2 space-y-4'>
                        {filteredFriends.length + filteredOthers.length > 0 ? (
                          <>
                            {filteredFriends.length > 0 && (
                              <div className='space-y-1'>
                                <div className='text-xs font-semibold text-primary px-1 mb-1'>
                                  {t('Friends')}
                                </div>
                                {filteredFriends.map((p) => {
                                  const disabled =
                                    !selected.includes(p.uid) &&
                                    selected.length + 1 >= playerCount;
                                  return (
                                    <label
                                      key={p.uid}
                                      className={`flex items-center justify-between p-2 rounded-md hover:bg-accent transition-colors cursor-pointer ${
                                        disabled
                                          ? 'opacity-50 cursor-not-allowed'
                                          : ''
                                      }`}
                                    >
                                      <div className='flex items-center gap-3'>
                                        <Avatar className='h-8 w-8'>
                                          <AvatarImage
                                            src={p.photoURL ?? undefined}
                                          />
                                          <AvatarFallback>
                                            {p.name?.[0]}
                                          </AvatarFallback>
                                        </Avatar>
                                        <span className='text-sm font-medium'>
                                          {p.name}
                                        </span>
                                      </div>
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
                                    </label>
                                  );
                                })}
                              </div>
                            )}

                            {filteredOthers.length > 0 && (
                              <div className='space-y-1'>
                                <div className='text-xs font-semibold text-muted-foreground px-1 mb-1'>
                                  {t('Others')}
                                </div>
                                {filteredOthers.map((p) => {
                                  const disabled =
                                    !selected.includes(p.uid) &&
                                    selected.length + 1 >= playerCount;
                                  return (
                                    <label
                                      key={p.uid}
                                      className={`flex items-center justify-between p-2 rounded-md hover:bg-accent transition-colors cursor-pointer ${
                                        disabled
                                          ? 'opacity-50 cursor-not-allowed'
                                          : ''
                                      }`}
                                    >
                                      <div className='flex items-center gap-3'>
                                        <Avatar className='h-8 w-8 grayscale opacity-80'>
                                          <AvatarImage
                                            src={p.photoURL ?? undefined}
                                          />
                                          <AvatarFallback>
                                            {p.name?.[0]}
                                          </AvatarFallback>
                                        </Avatar>
                                        <span className='text-sm font-medium'>
                                          {p.name}
                                        </span>
                                      </div>
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
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className='flex flex-col items-center justify-center h-32 text-muted-foreground text-sm'>
                            <Users className='h-8 w-8 mb-2 opacity-20' />
                            {t('No players found')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter className='p-6 pt-2 flex-shrink-0'>
                <Button variant='outline' onClick={() => setDialogOpen(false)}>
                  {t('Cancel')}
                </Button>
                <Button onClick={createTournament} disabled={creating}>
                  {creating ? (
                    <>
                      <span className='animate-spin mr-2'>⏳</span>{' '}
                      {t('Creating...')}
                    </>
                  ) : (
                    t('Create Tournament')
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters & List */}
        <div className='space-y-6'>
          <div className='flex flex-col sm:flex-row gap-4'>
            <div className='relative flex-1'>
              <SearchIcon className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
              <Input
                placeholder={t('Search tournaments...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className='pl-9'
              />
            </div>
            <Tabs
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as any)}
              className='w-full sm:w-auto'
            >
              <TabsList className='grid w-full grid-cols-3 sm:w-auto'>
                <TabsTrigger value='active'>{t('Active')}</TabsTrigger>
                <TabsTrigger value='finished'>{t('Finished')}</TabsTrigger>
                <TabsTrigger value='all'>{t('All')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {isLoading ? (
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className='h-[200px] rounded-xl bg-muted/20 animate-pulse'
                />
              ))}
            </div>
          ) : filteredTournaments.length > 0 ? (
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
              {filteredTournaments.map((tournament) => (
                <Link
                  href={`/tournaments/${tournament.id}`}
                  key={tournament.id}
                >
                  <Card className='h-full hover:shadow-lg transition-all hover:-translate-y-1 duration-200 group border-muted cursor-pointer overflow-hidden'>
                    <div className='h-2 w-full bg-gradient-to-r from-blue-500 to-indigo-500 opacity-80 group-hover:opacity-100 transition-opacity' />
                    <CardHeader className='pb-2'>
                      <div className='flex justify-between items-start gap-4'>
                        <div className='space-y-1'>
                          <CardTitle className='line-clamp-1 text-lg'>
                            {tournament.name}
                          </CardTitle>
                          <CardDescription className='flex items-center gap-1 text-xs'>
                            <Calendar className='h-3 w-3' />
                            {safeFormatDate(tournament.createdAt, 'dd.MM.yyyy')}
                          </CardDescription>
                        </div>
                        {tournament.isFinished ? (
                          <span className='px-2 py-1 rounded-full bg-muted text-xs font-medium text-muted-foreground flex items-center gap-1'>
                            <CheckCircle2 className='h-3 w-3' /> {t('Done')}
                          </span>
                        ) : (
                          <span className='px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium flex items-center gap-1 animate-pulse'>
                            <Clock className='h-3 w-3' /> {t('Live')}
                          </span>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {tournament.isFinished && tournament.champion ? (
                        <div className='mt-2 p-3 bg-amber-50 border border-amber-100 rounded-lg flex items-center gap-3'>
                          <div className='p-2 bg-amber-100 rounded-full'>
                            <Crown className='h-4 w-4 text-amber-600' />
                          </div>
                          <div>
                            <p className='text-xs text-amber-600 font-semibold uppercase tracking-wide'>
                              {t('Winner')}
                            </p>
                            <p className='font-bold text-amber-900'>
                              {tournament.champion.name}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className='mt-2 p-3 bg-muted/30 rounded-lg border border-transparent group-hover:border-muted transition-colors'>
                          <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                            <Users className='h-4 w-4' />
                            <span>
                              {tournament.participants?.length ?? 0}{' '}
                              {t('participants')}
                            </span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <div className='text-center py-20'>
              <div className='bg-muted/30 rounded-full p-4 inline-block mb-4'>
                <Search className='h-8 w-8 text-muted-foreground' />
              </div>
              <h3 className='text-lg font-medium'>
                {t('No tournaments found')}
              </h3>
              <p className='text-muted-foreground'>
                {t('Try adjusting your filters or create a new one.')}
              </p>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
