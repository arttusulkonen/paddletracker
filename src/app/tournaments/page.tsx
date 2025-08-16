'use client';

import { ProtectedRoute } from '@/components/ProtectedRoutes';
import {
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
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
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
import { PlusCircle, SearchIcon, UsersIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const PLAYER_COUNTS = [4, 6, 8, 12] as const;

export default function TournamentRoomsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const { toast } = useToast();

  const [tournaments, setTournaments] = useState<TournamentRoom[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [coPlayers, setCoPlayers] = useState<UserProfile[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [playerCount, setPlayerCount] =
    useState<(typeof PLAYER_COUNTS)[number]>(4);
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    const col = collection(db, 'tournament-rooms');
    const unsub = onSnapshot(
      col,
      (snap) => {
        const arr = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        const filtered = arr.filter((t) =>
          (t.participants ?? []).some((p: any) => p.userId === user.uid)
        );
        filtered.sort(
          (a, b) =>
            parseFlexDate(b.createdAt).getTime() -
            parseFlexDate(a.createdAt).getTime()
        );
        setTournaments(filtered);
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
  }, [user, toast, t]);

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
    if (!user) return;
    const q = query(
      collection(db, 'rooms'),
      where('memberIds', 'array-contains', user.uid)
    );
    const unsub = onSnapshot(q, async (snap) => {
      const set = new Set<string>();
      snap.docs.forEach((d) =>
        (d.data().memberIds ?? []).forEach((uid: string) =>
          uid !== user.uid ? set.add(uid) : null
        )
      );
      const toLoad = Array.from(set).filter(
        (uid) => !friends.some((f) => f.uid === uid)
      );
      const loaded = await Promise.all(
        toLoad.map(async (uid) => ({ uid, ...(await getUserLite(uid)) }))
      );
      setCoPlayers(loaded);
    });
    return () => unsub();
  }, [user, friends]);

  const candidates = useMemo(() => {
    const map = new Map<string, UserProfile>();
    [...friends, ...coPlayers].forEach((p) => map.set(p.uid, p));
    return Array.from(map.values()).sort((a, b) =>
      (a.name ?? a.displayName ?? '').localeCompare(
        b.name ?? b.displayName ?? ''
      )
    );
  }, [friends, coPlayers]);

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

  const createTournament = async () => {
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
      const now = getFinnishFormattedDate();
      const participants = shuffle([
        {
          userId: user.uid,
          name: userProfile?.name ?? userProfile?.displayName ?? '',
        },
        ...selected.map((uid) => {
          const p = candidates.find((c) => c.uid === uid)!;
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
        createdAt: now,
        creator: user.uid,
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
      router.push(`/tournaments/${ref.id}`);
    } catch (e) {
      console.error(e);
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
      tournaments.filter((t) =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [tournaments, searchTerm]
  );

  if (!hasMounted) {
    return null;
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
            <DialogContent className='sm:max-w-[420px]'>
              <DialogHeader>
                <DialogTitle>{t('Create Tournament')}</DialogTitle>
                <DialogDescription>
                  {t('Give it a name, choose size and pick participants')}
                </DialogDescription>
              </DialogHeader>
              <div className='space-y-4 py-4'>
                <div className='grid grid-cols-4 items-center gap-4'>
                  <Label className='text-right'>{t('Name')}</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className='col-span-3'
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
                <div>
                  <p className='text-sm font-medium mb-2'>
                    {`${t('Select participants')} (${selected.length + 1}/${playerCount})`}
                  </p>
                  <ScrollArea className='h-48 pr-2'>
                    {candidates.length ? (
                      candidates.map((p) => {
                        const disabled =
                          !selected.includes(p.uid) &&
                          selected.length + 1 >= playerCount;
                        return (
                          <label
                            key={p.uid}
                            className={`flex items-center gap-2 py-1 ${
                              disabled ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                          >
                            <Checkbox
                              disabled={disabled}
                              checked={selected.includes(p.uid)}
                              onCheckedChange={(v) =>
                                v
                                  ? setSelected([...selected, p.uid])
                                  : setSelected(
                                      selected.filter((id) => id !== p.uid)
                                    )
                              }
                            />
                            <span>{p.name ?? p.displayName}</span>
                          </label>
                        );
                      })
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
