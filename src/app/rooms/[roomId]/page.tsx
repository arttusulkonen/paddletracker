'use client';

import { ProtectedRoute } from '@/components/ProtectedRoutes';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  ScrollArea,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { finalizeSeason } from '@/lib/season';
import type { Match, Room, UserProfile } from '@/lib/types';
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
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  ArrowLeft,
  Crown,
  MailPlus,
  Plus,
  ShieldCheck,
  Sword,
  Trash2,
  Users,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

/* --- Helpers --- */
const calcWinPct = (w: number, l: number) => {
  const t = w + l;
  return t ? ((w / t) * 100).toFixed(1) : '0.0';
};
const tsToMs = (v?: string) => {
  const ms = parseFlexDate(v ?? '').getTime();
  return isNaN(ms) ? Date.parse(v ?? '') || 0 : ms;
};
const flip = (s: string) =>
  s === 'left' ? 'right' : s === 'right' ? 'left' : '';
type StartEndElo = Record<string, { start: number; end: number }>;
function getRank(elo: number, t: (key: string) => string) {
  if (elo < 1001) return t('Ping-Pong Padawan');
  if (elo < 1100) return t('Table-Tennis Trainee');
  if (elo < 1200) return t('Racket Rookie');
  if (elo < 1400) return t('Paddle Prodigy');
  if (elo < 1800) return t('Spin Sensei');
  if (elo < 2000) return t('Smash Samurai');
  return t('Ping-Pong Paladin');
}

/* --- Main Component --- */
export default function RoomPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const roomId = useParams().roomId as string;

  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Room['members']>([]);
  const [recent, setRecent] = useState<Match[]>([]);
  const [seasonStarts, setSeasonStarts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [latestSeason, setLatestSeason] = useState<any | null>(null);
  const [viewMode, setViewMode] = useState<'regular' | 'final'>('regular');
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    dir: 'asc' | 'desc';
  }>({ key: 'rating', dir: 'desc' });
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (latestSeason) setViewMode('final');
  }, [latestSeason]);

  useEffect(() => {
    if (!user) return;
    const unsubRoom = onSnapshot(doc(db, 'rooms', roomId), async (roomSnap) => {
      if (!roomSnap.exists()) {
        router.push('/rooms');
        return;
      }
      const roomData = roomSnap.data() as Room;
      const matchesQuery = query(
        collection(db, 'matches'),
        where('roomId', '==', roomId)
      );
      const matchesSnap = await getDocs(matchesQuery);
      const allMatches = matchesSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) } as Match))
        .sort(
          (a, b) => tsToMs((a as any).timestamp) - tsToMs((b as any).timestamp)
        );
      const starts: Record<string, number> = {};
      allMatches.forEach((m) => {
        const p1 = m.player1Id,
          p2 = m.player2Id;
        if (starts[p1] == null) starts[p1] = m.player1.oldRating;
        if (starts[p2] == null) starts[p2] = m.player2.oldRating;
      });
      setSeasonStarts(starts);
      const initialMembers = roomData.members ?? [];
      if (initialMembers.length > 0) {
        const memberIds = initialMembers.map((m) => m.userId);
        const userDocsPromises = memberIds.map((id) =>
          getDoc(doc(db, 'users', id))
        );
        const userDocsSnaps = await Promise.all(userDocsPromises);
        const freshProfiles = new Map<string, UserProfile>();
        userDocsSnaps.forEach((userSnap) => {
          if (userSnap.exists()) {
            freshProfiles.set(userSnap.id, userSnap.data() as UserProfile);
          }
        });
        const syncedMembers = initialMembers.map((member) => {
          const freshProfile = freshProfiles.get(member.userId);
          return freshProfile
            ? {
                ...member,
                name:
                  freshProfile.name ?? freshProfile.displayName ?? member.name,
                photoURL: freshProfile.photoURL,
                globalElo: freshProfile.globalElo,
                maxRating: freshProfile.maxRating,
                rank: freshProfile.rank,
              }
            : member;
        });
        setMembers(syncedMembers);
        setRoom({ ...roomData, members: syncedMembers });
        const syncedMatches = allMatches.map((match) => {
          const p1Profile = freshProfiles.get(match.player1Id);
          const p2Profile = freshProfiles.get(match.player2Id);
          const newMatch = JSON.parse(JSON.stringify(match));
          if (p1Profile)
            newMatch.player1.name =
              p1Profile.name ?? p1Profile.displayName ?? match.player1.name;
          if (p2Profile)
            newMatch.player2.name =
              p2Profile.name ?? p2Profile.displayName ?? match.player2.name;
          const winnerId =
            match.player1.scores > match.player2.scores
              ? match.player1Id
              : match.player2Id;
          const winnerProfile = freshProfiles.get(winnerId);
          if (winnerProfile)
            newMatch.winner =
              winnerProfile.name ?? winnerProfile.displayName ?? match.winner;
          return newMatch;
        });
        setRecent(syncedMatches.slice().reverse());
      } else {
        setMembers([]);
        setRoom(roomData);
        setRecent([]);
      }
      setLatestSeason(
        roomData.seasonHistory
          ?.slice()
          .reverse()
          .find((s) => Array.isArray(s.summary) || Array.isArray(s.members)) ??
          null
      );
      setIsLoading(false);
    });
    return () => {
      unsubRoom();
    };
  }, [user, roomId, router]);

  const getSeasonEloSnapshots = async (
    roomId: string
  ): Promise<StartEndElo> => {
    const qs = query(
      collection(db, 'matches'),
      where('roomId', '==', roomId),
      orderBy('tsIso', 'asc')
    );
    const snap = await getDocs(qs);
    const firstSeen: Record<string, number> = {};
    const lastSeen: Record<string, number> = {};
    snap.docs.forEach((d) => {
      const m = d.data() as any;
      const players: { id: string; old: number; new: number }[] = [
        { id: m.player1Id, old: m.player1.oldRating, new: m.player1.newRating },
        { id: m.player2Id, old: m.player2.oldRating, new: m.player2.newRating },
      ];
      players.forEach((p) => {
        if (!(p.id in firstSeen)) firstSeen[p.id] = p.old;
        lastSeen[p.id] = p.new;
      });
    });
    const out: StartEndElo = {};
    Object.keys(firstSeen).forEach((uid) => {
      out[uid] = {
        start: firstSeen[uid],
        end: lastSeen[uid] ?? firstSeen[uid],
      };
    });
    return out;
  };

  const handleFinishSeason = async () => {
    try {
      const eloSnapshots = await getSeasonEloSnapshots(roomId);
      await finalizeSeason(roomId, eloSnapshots);
      toast({ title: t('Season finished') });
      setViewMode('final');
    } catch (err) {
      console.error(err);
      toast({
        title: t('Error'),
        description: t('Failed to finish season'),
        variant: 'destructive',
      });
    }
  };

  type MiniMatch = { result: 'W' | 'L'; opponent: string; score: string };

  const last5Form = (m: any): MiniMatch[] =>
    recent
      .filter((x) => x.player1Id === m.userId || x.player2Id === m.userId)
      .slice(0, 5)
      .map((x) => {
        const winnerId =
          x.player1.scores > x.player2.scores ? x.player1Id : x.player2Id;
        const win = winnerId === m.userId;
        const youOnLeft = x.player1Id === m.userId;
        const youScore = youOnLeft ? x.player1.scores : x.player2.scores;
        const oppScore = youOnLeft ? x.player2.scores : x.player1.scores;
        const opponent = youOnLeft ? x.player2.name : x.player1.name;
        return {
          result: win ? 'W' : 'L',
          opponent,
          score: `${youScore}-${oppScore}`,
        };
      });

  const bestWinStreak = (m: any) => {
    const arr = recent
      .filter((x) => x.player1Id === m.userId || x.player2Id === m.userId)
      .map((x) => {
        const winnerId =
          x.player1.scores > x.player2.scores ? x.player1Id : x.player2Id;
        return winnerId === m.userId ? 1 : 0;
      });
    let max = 0,
      cur = 0;
    arr.forEach((w) => {
      cur = w ? cur + 1 : 0;
      if (cur > max) max = cur;
    });
    return max;
  };

  const matchStats = useMemo(() => {
    const st: Record<string, { wins: number; losses: number }> = {};
    recent.forEach((m) => {
      const winnerId =
        m.player1.scores > m.player2.scores ? m.player1Id : m.player2Id;
      [m.player1Id, m.player2Id].forEach((id) => {
        if (!st[id]) st[id] = { wins: 0, losses: 0 };
        if (id === winnerId) st[id].wins++;
        else st[id].losses++;
      });
    });
    return st;
  }, [recent]);

  const regularPlayers = useMemo(() => {
    return members
      .map((m) => {
        const wins = matchStats[m.userId]?.wins ?? 0;
        const losses = matchStats[m.userId]?.losses ?? 0;
        const total = wins + losses;
        const globalStart = seasonStarts[m.userId] ?? m.globalElo ?? 1000;
        const globalDelta = (m.globalElo ?? globalStart) - globalStart;
        const seasonDeltaRoom = (m.rating || 0) - (m.startRating ?? 1000);
        const avgPtsPerMatch = total > 0 ? seasonDeltaRoom / total : 0;
        return {
          ...m,
          ratingVisible: total >= 5,
          wins,
          losses,
          totalMatches: total,
          winPct: calcWinPct(wins, losses),
          deltaRoom: seasonDeltaRoom,
          globalDelta,
          avgPtsPerMatch: avgPtsPerMatch,
          last5Form: last5Form(m),
          longestWinStreak: bestWinStreak(m),
        };
      })
      .sort((a: any, b: any) => {
        if (a.ratingVisible !== b.ratingVisible)
          return a.ratingVisible ? -1 : 1;
        const { key, dir } = sortConfig;
        const factor = dir === 'asc' ? 1 : -1;
        if (key === 'winPct')
          return factor * (parseFloat(a.winPct) - parseFloat(b.winPct));
        if (['name'].includes(key))
          return factor * a.name.localeCompare(b.name);
        return factor * ((a as any)[key] - (b as any)[key]);
      });
  }, [members, recent, seasonStarts, sortConfig, matchStats]);

  if (!hasMounted) {
    return null;
  }

  if (isLoading || !room) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='animate-spin h-16 w-16 rounded-full border-b-4 border-primary' />
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className='container mx-auto py-8 px-4'>
        <Button
          variant='outline'
          className='mb-6'
          onClick={() => router.push('/rooms')}
        >
          <ArrowLeft className='mr-2 h-4 w-4' />
          {t('Back to Rooms')}
        </Button>
        <Card className='mb-8 shadow-xl'>
          <CardHeader className='bg-muted/50 p-6 flex flex-col md:flex-row items-center gap-6'>
            <Avatar className='h-24 w-24 border-4 border-background shadow-md'>
              <AvatarImage src={room.avatarURL || undefined} />
              <AvatarFallback>{room.name[0]}</AvatarFallback>
            </Avatar>
            <div className='text-center md:text-left'>
              <CardTitle className='text-3xl font-bold'>{room.name}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className='p-6 grid md:grid-cols-3 gap-6'>
            <MembersBlock
              members={regularPlayers}
              room={room}
              roomId={roomId}
              t={t}
            />
            {!latestSeason && (
              <RecordBlock members={members} roomId={roomId} t={t} />
            )}
            {!latestSeason && (
              <div className='md:col-span-3 text-right'>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant='destructive'>{t('Finish Season')}</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t('Are you absolutely sure?')}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t(
                          'This action will close the current season for this room. All standings will be finalized, and no new matches can be recorded for this season. This cannot be undone.'
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                      <AlertDialogAction onClick={handleFinishSeason}>
                        {t('Yes, Finish Season')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </CardContent>
        </Card>
        <Separator className='my-8' />
        <Card className='shadow-lg mb-8'>
          <CardHeader>
            <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
              <CardTitle>{t('Standings')}</CardTitle>
              {latestSeason && (
                <div className='flex gap-2'>
                  <Button
                    size='sm'
                    variant={viewMode === 'regular' ? 'default' : 'outline'}
                    onClick={() => setViewMode('regular')}
                  >
                    {t('Regular')}
                  </Button>
                  <Button
                    size='sm'
                    variant={viewMode === 'final' ? 'default' : 'outline'}
                    onClick={() => setViewMode('final')}
                  >
                    {t('Final')}
                  </Button>
                </div>
              )}
            </div>
            <CardDescription>
              {viewMode === 'regular'
                ? t('Live season standings')
                : t('Season awards (final)')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {viewMode === 'regular' && (
              <ScrollArea>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead
                        className='cursor-pointer'
                        onClick={() =>
                          setSortConfig((s) => ({
                            key: 'name',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        {t('Player')}
                      </TableHead>
                      <TableHead
                        className='cursor-pointer'
                        onClick={() =>
                          setSortConfig((s) => ({
                            key: 'rating',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        {t('Room Rating')}
                      </TableHead>
                      <TableHead
                        className='cursor-pointer'
                        onClick={() =>
                          setSortConfig((s) => ({
                            key: 'deltaRoom',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        {t('Room Δ')}
                      </TableHead>
                      <TableHead
                        className='cursor-pointer'
                        onClick={() =>
                          setSortConfig((s) => ({
                            key: 'globalDelta',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        {t('Global Δ')}
                      </TableHead>
                      <TableHead
                        className='cursor-pointer'
                        onClick={() =>
                          setSortConfig((s) => ({
                            key: 'totalMatches',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        {t('Games')}
                      </TableHead>
                      <TableHead
                        className='cursor-pointer'
                        onClick={() =>
                          setSortConfig((s) => ({
                            key: 'wins',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        {t('Wins')}
                      </TableHead>
                      <TableHead
                        className='cursor-pointer'
                        onClick={() =>
                          setSortConfig((s) => ({
                            key: 'losses',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        {t('Losses')}
                      </TableHead>
                      <TableHead
                        className='cursor-pointer'
                        onClick={() =>
                          setSortConfig((s) => ({
                            key: 'winPct',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        {t('Win %')}
                      </TableHead>
                      <TableHead
                        className='cursor-pointer'
                        onClick={() =>
                          setSortConfig((s) => ({
                            key: 'avgPtsPerMatch',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        {t('Avg Δ / Game')}
                      </TableHead>
                      <TableHead>{t('Last 5 ←')}</TableHead>
                      <TableHead
                        className='cursor-pointer'
                        onClick={() =>
                          setSortConfig((s) => ({
                            key: 'longestWinStreak',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        {t('Best Streak')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {regularPlayers.map((p, i) => (
                      <TableRow key={p.userId}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell>
                          <a
                            href={`/profile/${p.userId}`}
                            className='hover:underline'
                          >
                            {p.name}
                          </a>
                          {p.userId === room.creator && (
                            <Crown className='inline ml-1 h-4 w-4 text-yellow-500' />
                          )}
                        </TableCell>
                        <TableCell>
                          {p.ratingVisible ? p.rating : '—'}
                        </TableCell>
                        <TableCell>
                          {p.ratingVisible ? p.deltaRoom.toFixed(0) : '—'}
                        </TableCell>
                        <TableCell>
                          {p.ratingVisible ? p.globalDelta.toFixed(0) : '—'}
                        </TableCell>
                        <TableCell>{p.totalMatches}</TableCell>
                        <TableCell>{p.wins}</TableCell>
                        <TableCell>{p.losses}</TableCell>
                        <TableCell>
                          {p.ratingVisible ? `${p.winPct}%` : '—'}
                        </TableCell>
                        <TableCell>
                          {p.ratingVisible ? p.avgPtsPerMatch.toFixed(2) : '—'}
                        </TableCell>
                        <TableCell>
                          {p.ratingVisible ? (
                            <div className='flex gap-1'>
                              {p.last5Form
                                .slice() // Создаем копию, чтобы не изменять исходный массив
                                .reverse() // Разворачиваем массив
                                .map((mm: MiniMatch, idx: number) => (
                                  <span
                                    key={idx}
                                    className={`inline-block w-2 h-2 rounded-full ${
                                      mm.result === 'W'
                                        ? 'bg-green-500'
                                        : 'bg-red-500'
                                    }`}
                                    title={`${t(
                                      mm.result === 'W' ? 'Win' : 'Loss'
                                    )} ${t('vs')} ${mm.opponent} (${mm.score})`}
                                  />
                                ))}
                            </div>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          {p.ratingVisible ? p.longestWinStreak : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
            {viewMode === 'final' && latestSeason && (
              <ScrollArea>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('Rank')}</TableHead>
                      <TableHead>{t('Player')}</TableHead>
                      <TableHead>{t('Games')}</TableHead>
                      <TableHead>{t('Wins')}</TableHead>
                      <TableHead>{t('Losses')}</TableHead>
                      <TableHead>{t('Best Streak')}</TableHead>
                      <TableHead>{t('Start Elo')}</TableHead>
                      <TableHead>{t('End Elo')}</TableHead>
                      <TableHead>{t('Elo Δ')}</TableHead>
                      <TableHead>{t('Total Δ')}</TableHead>
                      <TableHead>{t('Adjusted Pts')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(Array.isArray(latestSeason.summary)
                      ? latestSeason.summary
                      : latestSeason.members
                    ).map((r: any) => (
                      <TableRow key={r.userId}>
                        <TableCell>{r.place}</TableCell>
                        <TableCell>
                          <a
                            href={`/profile/${r.userId}`}
                            className='hover:underline'
                          >
                            {r.name}
                          </a>
                        </TableCell>
                        <TableCell>{r.matchesPlayed}</TableCell>
                        <TableCell>{r.wins}</TableCell>
                        <TableCell>{r.losses}</TableCell>
                        <TableCell>{r.longestWinStreak ?? '—'}</TableCell>
                        <TableCell>{r.startGlobalElo ?? '—'}</TableCell>
                        <TableCell>{r.endGlobalElo ?? '—'}</TableCell>
                        <TableCell>
                          {r.startGlobalElo != null && r.endGlobalElo != null
                            ? (r.endGlobalElo - r.startGlobalElo).toFixed(0)
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {r.totalAddedPoints?.toFixed(2) ?? '—'}
                        </TableCell>
                        <TableCell>{r.adjPoints?.toFixed(2) ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
            <div className='mt-4 text-xs text-muted-foreground leading-relaxed space-y-1'>
              <p>
                <strong>{t('Room Rating')}</strong> — {t('Elo score, recalculated based only on matches in this room (starting = 1000).')}
              </p>
              <p>
                <strong>{t('Room Δ')}</strong> — {t('vs. starting (1000): current room rating – 1000.')}
              </p>
              <p>
                <strong>{t('Global Δ')}</strong> — {t('Change in your overall Elo (across all rooms) since your first match this season.')}
              </p>
              <p>
                <strong>{t('Games / Wins / Losses')}</strong> —{' '}
                {t('Matches played and outcomes.')}
              </p>
              <p>
                <strong>{t('Win %')}</strong> — {t('(Wins / Games) × 100.')}
              </p>
              <p>
                <strong>{t('Avg Δ / Game')}</strong> — {t('Average room Elo change per match.')}
              </p>
              <p>
                <strong>{t('Last 5')}</strong> — {t('W = win, L = loss for the last five games.')}
              </p>
              <p>
                <strong>{t('Best Streak')}</strong> — {t('Longest consecutive winning streak.')}
              </p>
              {viewMode === 'final' && (
                <>
                  <p>
                    <strong>{t('Total Δ')}</strong> — {t('Sum of all Elo gains/losses for the season (room-specific).')}
                  </p>
                  <p>
                    <strong>{t('Adjusted Pts')}</strong> —{' '}
                    {t('Total Δ × √(AvgGames / YourGames)')}
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className='shadow-lg'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <ShieldCheck className='text-primary' />
              {t('Recent Matches')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length ? (
              <ScrollArea className='h-[800px]'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('Players')}</TableHead>
                      <TableHead>{t('Score')}</TableHead>
                      <TableHead>{t('Room Δ')}</TableHead>
                      <TableHead>{t('Elo Δ')}</TableHead>
                      <TableHead>{t('Winner')}</TableHead>
                      <TableHead>{t('Date')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recent.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          {m.player1.name} – {m.player2.name}
                        </TableCell>
                        <TableCell>
                          {m.player1.scores} – {m.player2.scores}
                        </TableCell>
                        <TableCell>
                          {m.player1.roomAddedPoints} |{' '}
                          {m.player2.roomAddedPoints}
                        </TableCell>
                        <TableCell>
                          {m.player1.newRating} | {m.player2.newRating}
                        </TableCell>
                        <TableCell className='font-semibold'>
                          {m.winner}
                        </TableCell>
                        <TableCell>
                          {safeFormatDate(
                            m.timestamp ??
                              (m as any).createdAt ??
                              (m as any).tsIso,
                            'dd.MM.yyyy HH:mm:ss'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            ) : (
              <p className='text-center py-8 text-muted-foreground'>
                {t('No recent matches')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}

function MembersBlock({
  members,
  room,
  roomId,
  t,
}: {
  members: any[];
  room: Room;
  roomId: string;
  t: (key: string, options?: any) => string;
}) {
  const [isInviting, setIsInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const { toast } = useToast();

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !room) return;
    setIsInviting(true);
    try {
      const qs = query(
        collection(db, 'users'),
        where('email', '==', inviteEmail.trim())
      );
      const snap = await getDocs(qs);
      if (snap.empty) {
        toast({ title: t('User not found'), variant: 'destructive' });
        return;
      }
      const uDoc = snap.docs[0];
      const target = uDoc.data() as UserProfile;
      const uid = uDoc.id;
      if (members.some((m) => m.userId === uid)) {
        toast({ title: t('User already in room') });
        return;
      }
      const newMember = {
        userId: uid,
        name: target.name ?? target.displayName ?? target.email!,
        email: target.email!,
        rating: 1000,
        startRating: 1000,
        wins: 0,
        losses: 0,
        date: getFinnishFormattedDate(),
        role: 'editor' as const,
      };
      await updateDoc(doc(db, 'rooms', roomId), {
        members: arrayUnion(newMember),
      });
      toast({
        title: t('Invited'),
        description: `${newMember.name} ${t('added')}`,
      });
      setInviteEmail('');
    } catch (e) {
      console.error(e);
      toast({ title: t('Error'), variant: 'destructive' });
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <div>
      <Users className='text-primary' />{' '}
      <span className='font-semibold'>
        {t('Members ({{count}})', { count: members.length })}
      </span>
      <ScrollArea className='border rounded-md p-3 bg-background'>
        {members.map((p) => {
          const rank = getRank(p.globalElo ?? 1000, t);
          return (
            <div
              key={p.userId}
              className='flex items-center justify-between p-2 hover:bg-muted/50 rounded-md transition-colors'
            >
              <div className='flex items-center gap-3'>
                <Avatar className='h-12 w-12'>
                  <AvatarImage src={p.photoURL || undefined} />
                  <AvatarFallback>{p.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className='font-medium leading-none'>
                    <a
                      href={`/profile/${p.userId}`}
                      className='hover:underline'
                    >
                      {p.name}
                    </a>
                    {p.userId === room.creator && (
                      <Crown className='inline ml-1 h-4 w-4 text-yellow-500' />
                    )}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {t('MP')} {p.totalMatches} · {t('W%')} {p.winPct}% ·{' '}
                    {t('ELO')} {p.globalElo?.toFixed(0) ?? '–'}
                  </p>
                  <p className='text-[10px] text-muted-foreground'>
                    {t('Rank')} {rank}
                  </p>
                </div>
              </div>
              <span className='text-sm font-semibold text-primary'>
                {p.rating}&nbsp;{t('pts')}
              </span>
            </div>
          );
        })}
      </ScrollArea>
      <Dialog>
        <DialogTrigger asChild>
          <Button
            className='mt-4 w-full'
            variant='outline'
            disabled={isInviting}
          >
            <MailPlus className='mr-2 h-4 w-4' /> {t('Invite Player')}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('Invite to {{roomName}}', { roomName: room.name })}
            </DialogTitle>
            <DialogDescription>{t('Enter email')}</DialogDescription>
          </DialogHeader>
          <div className='space-y-2 py-2'>
            <Label htmlFor='invEmail'>{t('Email')}</Label>
            <Input
              id='invEmail'
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant='ghost'>{t('Cancel')}</Button>
            </DialogClose>
            <Button onClick={handleInvite} disabled={isInviting}>
              {t('Send')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RecordBlock({
  members,
  roomId,
  t,
}: {
  members: Room['members'];
  roomId: string;
  t: (key: string, options?: any) => string;
}) {
  const [player1Id, setPlayer1Id] = useState('');
  const [player2Id, setPlayer2Id] = useState('');
  const [matchesInput, setMatchesInput] = useState([
    { score1: '', score2: '', side1: '', side2: '' },
  ]);
  const [isRecording, setIsRecording] = useState(false);
  const { toast } = useToast();

  const addRow = () =>
    setMatchesInput((rows) => {
      if (!rows.length)
        return [...rows, { score1: '', score2: '', side1: '', side2: '' }];
      const last = rows[rows.length - 1];
      return [
        ...rows,
        {
          score1: '',
          score2: '',
          side1: flip(last.side1),
          side2: flip(last.side2),
        },
      ];
    });
  const removeRow = (i: number) =>
    setMatchesInput((r) => r.filter((_, idx) => idx !== i));

  const saveMatches = async () => {
    if (!player1Id || !player2Id || player1Id === player2Id) {
      toast({
        title: t('Select two different players'),
        variant: 'destructive',
      });
      return;
    }
    const bad = matchesInput.find(({ score1, score2, side1, side2 }) => {
      const a = +score1,
        b = +score2;
      if (isNaN(a) || isNaN(b) || !side1 || !side2) return true;
      const hi = Math.max(a, b),
        lo = Math.min(a, b);
      return hi < 11 || (hi === 11 && lo > 9) || (hi > 11 && hi - lo !== 2);
    });
    if (bad) {
      toast({ title: t('Check the score values') });
      return;
    }
    setIsRecording(true);
    try {
      const [snap1, snap2] = await Promise.all([
        getDoc(doc(db, 'users', player1Id)),
        getDoc(doc(db, 'users', player2Id)),
      ]);
      let currentG1 = snap1.data()?.globalElo ?? 1000;
      let currentG2 = snap2.data()?.globalElo ?? 1000;
      let draft = JSON.parse(JSON.stringify(members)) as Room['members'];
      const historyUpdates: Record<string, any> = {};
      const startDate = new Date();
      const pushRank = (tsIso: string) => {
        draft.forEach((mem) => {
          const place =
            [...draft]
              .sort((a, b) => b.rating - a.rating)
              .findIndex((x) => x.userId === mem.userId) + 1;
          if (mem.prevPlace !== place) {
            historyUpdates[`rankHistories.${mem.userId}`] = arrayUnion({
              ts: tsIso,
              place,
              rating: mem.rating,
            });
          }
          mem.prevPlace = place;
        });
      };
      const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
      for (let idx = 0; idx < matchesInput.length; idx++) {
        const row = matchesInput[idx];
        const a = +row.score1,
          b = +row.score2;
        const winnerId = a > b ? player1Id : player2Id;
        const K = 32;
        const exp1 = 1 / (1 + 10 ** ((currentG2 - currentG1) / 400));
        const exp2 = 1 / (1 + 10 ** ((currentG1 - currentG2) / 400));
        const newG1 = Math.round(
          currentG1 + K * ((winnerId === player1Id ? 1 : 0) - exp1)
        );
        const newG2 = Math.round(
          currentG2 + K * ((winnerId === player2Id ? 1 : 0) - exp2)
        );
        const dG1 = newG1 - currentG1;
        const dG2 = newG2 - currentG2;
        currentG1 = newG1;
        currentG2 = newG2;
        const ts = new Date(startDate.getTime() + idx * 1000);
        const createdAt = getFinnishFormattedDate(ts);
        const tsIso = ts.toISOString();
        const p1 = draft.find((m) => m.userId === player1Id)!;
        const p2 = draft.find((m) => m.userId === player2Id)!;
        [p1, p2].forEach((p) => {
          const delta = p.userId === player1Id ? dG1 : dG2;
          const win = winnerId === p.userId;
          const curSt = win ? (p.currentStreak || 0) + 1 : 0;
          Object.assign(p, {
            rating: p.rating + delta,
            wins: p.wins + (win ? 1 : 0),
            losses: p.losses + (win ? 0 : 1),
            currentStreak: curSt,
            longestWinStreak: Math.max(p.longestWinStreak || 0, curSt),
            totalAddedPoints: (p.totalAddedPoints || 0) + delta,
            totalMatches: (p.totalMatches || 0) + 1,
          });
        });
        pushRank(tsIso);
        const matchDoc = {
          roomId,
          createdAt,
          timestamp: createdAt,
          tsIso,
          player1Id,
          player2Id,
          players: [player1Id, player2Id],
          player1: {
            name: p1.name,
            scores: a,
            oldRating: currentG1 - dG1,
            newRating: currentG1,
            addedPoints: dG1,
            roomOldRating: p1.rating - dG1,
            roomNewRating: p1.rating,
            roomAddedPoints: dG1,
            side: row.side1,
          },
          player2: {
            name: p2.name,
            scores: b,
            oldRating: currentG2 - dG2,
            newRating: currentG2,
            addedPoints: dG2,
            roomOldRating: p2.rating - dG2,
            roomNewRating: p2.rating,
            roomAddedPoints: dG2,
            side: row.side2,
          },
          winner: winnerId === player1Id ? p1.name : p2.name,
        };
        await addDoc(collection(db, 'matches'), matchDoc);
        if (idx < matchesInput.length - 1) {
          await wait(1000);
        }
      }
      await updateDoc(doc(db, 'rooms', roomId), {
        members: draft,
        ...historyUpdates,
      });
      await Promise.all([
        updateDoc(doc(db, 'users', player1Id), {
          globalElo: currentG1,
          eloHistory: arrayUnion({
            ts: new Date().toISOString(),
            elo: currentG1,
          }),
        }),
        updateDoc(doc(db, 'users', player2Id), {
          globalElo: currentG2,
          eloHistory: arrayUnion({
            ts: new Date().toISOString(),
            elo: currentG2,
          }),
        }),
      ]);
      setPlayer1Id('');
      setPlayer2Id('');
      setMatchesInput([{ score1: '', score2: '', side1: '', side2: '' }]);
      toast({ title: t('Matches recorded') });
    } catch (err) {
      console.error(err);
      toast({
        title: t('Error'),
        description: t('Failed to record matches'),
        variant: 'destructive',
      });
    } finally {
      setIsRecording(false);
    }
  };

  useEffect(() => {
    if (player1Id && player1Id === player2Id) setPlayer2Id('');
  }, [player1Id, player2Id]);

  const listP1 = members
    .filter((m) => m.userId !== player2Id)
    .map((m) => ({ userId: m.userId, name: m.name, rating: m.rating }));
  const listP2 = members
    .filter((m) => m.userId !== player1Id)
    .map((m) => ({ userId: m.userId, name: m.name, rating: m.rating }));

  return (
    <Card className='md:col-span-2 shadow-md'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Sword className='text-accent' /> {t('Record Matches')}
        </CardTitle>
        <CardDescription>{t('Select players and scores')}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid grid-cols-2 gap-4 items-end'>
          <PlayerSelect
            label={t('Player 1')}
            value={player1Id}
            onChange={setPlayer1Id}
            list={listP1}
            t={t}
          />
          <PlayerSelect
            label={t('Player 2')}
            value={player2Id}
            onChange={setPlayer2Id}
            list={listP2}
            t={t}
          />
        </div>
        {matchesInput.map((row, i) => (
          <MatchRowInput
            key={i}
            index={i}
            data={row}
            onChange={(d) =>
              setMatchesInput((r: any) =>
                r.map((v: any, idx: number) => (idx === i ? d : v))
              )
            }
            onRemove={() => removeRow(i)}
            removable={i > 0}
            t={t}
          />
        ))}
        <Button
          variant='outline'
          className='flex items-center gap-2'
          onClick={addRow}
        >
          <Plus /> {t('Add Match')}
        </Button>
        <Button
          className='w-full mt-4'
          disabled={isRecording}
          onClick={saveMatches}
        >
          {isRecording ? t('Recording…') : t('Record & Update ELO')}
        </Button>
      </CardContent>
    </Card>
  );
}

function PlayerSelect({
  label,
  value,
  onChange,
  list,
  t,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  list: { userId: string; name: string; rating: number }[];
  t: (key: string) => string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <select
        className='w-full border rounded p-2'
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value=''>{t('Select')}</option>
        {list.map((o) => (
          <option key={o.userId} value={o.userId}>
            {o.name} ({o.rating})
          </option>
        ))}
      </select>
    </div>
  );
}

function MatchRowInput({
  data,
  onChange,
  onRemove,
  removable,
  t,
}: {
  index: number;
  data: any;
  onChange(d: any): void;
  onRemove(): void;
  removable: boolean;
  t: (key: string) => string;
}) {
  return (
    <div className='grid grid-cols-2 gap-4 mb-2 relative'>
      {['1', '2'].map((n) => (
        <div key={n}>
          <Label>{t(`P${n} Score`)}</Label>
          <Input
            type='number'
            value={data[`score${n}`]}
            onChange={(e) =>
              onChange({ ...data, [`score${n}`]: e.target.value })
            }
          />
          <Label className='mt-2'>{t('Side')}</Label>
          <select
            className='w-full border rounded p-2'
            value={data[`side${n}`]}
            onChange={(e) =>
              onChange({
                ...data,
                [`side${n}`]: e.target.value,
                [`side${n === '1' ? '2' : '1'}`]:
                  e.target.value === 'left' ? 'right' : 'left',
              })
            }
          >
            <option value=''>{t('–')}</option>
            <option value='left'>{t('Left')}</option>
            <option value='right'>{t('Right')}</option>
          </select>
        </div>
      ))}
      {removable && (
        <Button
          variant='ghost'
          className='absolute top-1/2 right-0 -translate-y-1/2'
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      )}
    </div>
  );
}
