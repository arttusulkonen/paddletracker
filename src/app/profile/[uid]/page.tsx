'use client';

import AchievementsPanel from '@/components/AchievementsPanel';
import {
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { auth, db } from '@/lib/firebase';
import * as Friends from '@/lib/friends';
import type { Match, UserProfile } from '@/lib/types';
import { parseFlexDate, safeFormatDate } from '@/lib/utils/date';
import { updateProfile } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';

import {
  Activity,
  ArrowLeftRight,
  CornerUpLeft,
  CornerUpRight,
  Flame,
  LineChart as LineChartIcon,
  ListOrdered,
  Pencil,
  Percent,
  PieChart as PieChartIcon,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip as RechartTooltip,
  Legend as ReLegend,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';

// --- Helpers ---
const getRank = (elo: number, t: (key: string) => string) =>
  elo < 1001
    ? t('Ping-Pong Padawan')
    : elo < 1100
    ? t('Table-Tennis Trainee')
    : elo < 1200
    ? t('Racket Rookie')
    : elo < 1400
    ? t('Paddle Prodigy')
    : elo < 1800
    ? t('Spin Sensei')
    : elo < 2000
    ? t('Smash Samurai')
    : t('Ping-Pong Paladin');
const medalMap: Record<string, string> = {
  'Ping-Pong Padawan': '/img/ping-pong-padawan.png',
  'Table-Tennis Trainee': '/img/table-tennis-trainee.png',
  'Racket Rookie': '/img/racket-rookie.png',
  'Paddle Prodigy': '/img/paddle-prodigy.png',
  'Spin Sensei': '/img/spin-sensei.png',
  'Smash Samurai': '/img/smash-samurai.png',
  'Ping-Pong Paladin': '/img/ping-pong-paladin.png',
};
function computeStats(list: Match[], uid: string) {
  let wins = 0,
    losses = 0,
    best = -Infinity,
    worst = Infinity,
    scored = 0,
    conceded = 0,
    curW = 0,
    curL = 0,
    maxW = 0,
    maxL = 0;
  list.forEach((m) => {
    const p1 = m.player1Id === uid;
    const me = p1 ? m.player1 : m.player2;
    const opp = p1 ? m.player2 : m.player1;
    const win = me.scores > opp.scores;
    scored += me.scores;
    conceded += opp.scores;
    if (win) {
      wins++;
      curW++;
      curL = 0;
      maxW = Math.max(maxW, curW);
      best = Math.max(best, me.scores - opp.scores);
    } else {
      losses++;
      curL++;
      curW = 0;
      maxL = Math.max(maxL, curL);
      worst = Math.min(worst, me.scores - opp.scores);
    }
  });
  const total = wins + losses;
  return {
    total,
    wins,
    losses,
    winRate: total ? (wins / total) * 100 : 0,
    bestWinMargin: isFinite(best) ? best : 0,
    worstLossMargin: isFinite(worst) ? Math.abs(worst) : 0,
    pointsScored: scored,
    pointsConceded: conceded,
    pointsDiff: scored - conceded,
    maxWinStreak: maxW,
    maxLossStreak: maxL,
  };
}
function computeSideStats(list: Match[], uid: string) {
  let leftSideWins = 0,
    leftSideLosses = 0,
    rightSideWins = 0,
    rightSideLosses = 0,
    leftPointsScored = 0,
    leftPointsConceded = 0,
    rightPointsScored = 0,
    rightPointsConceded = 0;
  list.forEach((m) => {
    const isP1 = m.player1Id === uid;
    const me = isP1 ? m.player1 : m.player2;
    const opp = isP1 ? m.player2 : m.player1;
    const win = me.scores > opp.scores;
    if (me.side === 'left') {
      if (win) leftSideWins++;
      else leftSideLosses++;
      leftPointsScored += me.scores;
      leftPointsConceded += opp.scores;
    } else if (me.side === 'right') {
      if (win) rightSideWins++;
      else rightSideLosses++;
      rightPointsScored += me.scores;
      rightPointsConceded += opp.scores;
    }
  });
  return {
    leftSideWins,
    leftSideLosses,
    rightSideWins,
    rightSideLosses,
    leftPointsScored,
    leftPointsConceded,
    rightPointsScored,
    rightPointsConceded,
  };
}
function groupByMonth(list: Match[], uid: string) {
  const map = new Map<string, { start: number; end: number }>();
  list.forEach((m) => {
    const d = parseFlexDate(m.timestamp ?? (m as any).playedAt);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(
      2,
      '0'
    )}`;
    const isP1 = m.player1Id === uid;
    const me = isP1 ? m.player1 : m.player2;
    if (!map.has(key)) map.set(key, { start: me.oldRating, end: me.newRating });
    else map.get(key)!.end = me.newRating;
  });
  return Array.from(map.entries())
    .map(([label, v]) => ({ label, ...v, delta: v.end - v.start }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
const pct = (v: number) => `${v.toFixed(1)} %`;
function buildInsights(
  stats: ReturnType<typeof computeStats>,
  side: ReturnType<typeof computeSideStats>,
  monthly: ReturnType<typeof groupByMonth>,
  t: (key: string) => string
): any[] {
  const rows: any[] = [];
  const last = monthly.at(-1);
  if (last) {
    const up = last.delta >= 0;
    rows.push({
      icon: up ? TrendingUp : TrendingDown,
      color: up ? 'text-emerald-600' : 'text-rose-600',
      text: `${t(up ? 'Gained' : 'Lost')} <b>${Math.abs(
        last.delta
      )} ELO</b> ${t('over the last month')}`,
    });
  }
  if (monthly.length >= 3) {
    const best = [...monthly].sort((a, b) => b.delta - a.delta)[0];
    const worst = [...monthly].sort((a, b) => a.delta - b.delta)[0];
    rows.push({
      icon: TrendingUp,
      color: 'text-primary',
      text: `${t('Best month:')} <b>${best.label}</b> (+${best.delta} ELO)`,
    });
    rows.push({
      icon: TrendingDown,
      color: 'text-rose-600',
      text: `${t('Toughest month:')} <b>${worst.label}</b> (${
        worst.delta
      } ELO)`,
    });
  }
  const lGames = side.leftSideWins + side.leftSideLosses;
  const rGames = side.rightSideWins + side.rightSideLosses;
  if (lGames >= 10 && rGames >= 10) {
    const winL = (side.leftSideWins / lGames) * 100;
    const winR = (side.rightSideWins / rGames) * 100;
    const better = t(winL > winR ? 'left' : 'right');
    rows.push({
      icon: ArrowLeftRight,
      color: 'text-indigo-600',
      text:
        winL === winR
          ? `${t('Almost even on both sides')} (${pct(winL)} / ${pct(winR)})`
          : `${t('Stronger on the')} <b>${better}</b> ${t('side')} (${pct(
              Math.max(winL, winR)
            )} ${t('win-rate')})`,
    });
  }
  if (stats.maxWinStreak >= 8)
    rows.push({
      icon: Flame,
      color: 'text-amber-600',
      text: `${t('Longest winning streak:')} <b>${stats.maxWinStreak}</b> ${t(
        'games'
      )}`,
    });
  return rows;
}
function opponentStats(list: Match[], uid: string) {
  const map = new Map<
    string,
    { name: string; wins: number; losses: number; elo: number }
  >();
  list.forEach((m) => {
    const isP1 = m.player1Id === uid;
    const oppId = isP1 ? m.player2Id : m.player1Id;
    const oppName = isP1 ? m.player2.name : m.player1.name;
    const me = isP1 ? m.player1 : m.player2;
    const win = me.scores > (isP1 ? m.player2.scores : m.player1.scores);
    if (!map.has(oppId))
      map.set(oppId, { name: oppName, wins: 0, losses: 0, elo: 0 });
    const rec = map.get(oppId)!;
    win ? rec.wins++ : rec.losses++;
    rec.elo += me.addedPoints;
  });
  return Array.from(map.values())
    .map((r) => ({
      ...r,
      winRate: r.wins + r.losses ? (r.wins / (r.wins + r.losses)) * 100 : 0,
    }))
    .sort((a, b) => b.winRate - a.winRate);
}
const CustomTooltip: FC<any> = ({ active, payload, label, t }) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className='bg-white p-2 rounded shadow-lg text-sm border'>
      <div className='font-semibold mb-1'>{label}</div>
      <div>
        {t('Opponent')}: {data.opponent}
      </div>
      <div>
        {t('Score')}: {data.score}
      </div>
      <div>
        {t('Δ Points')}:{' '}
        {data.addedPoints > 0 ? `+${data.addedPoints}` : data.addedPoints}
      </div>
      <div>
        {t('Your ELO')}: {data.rating}
      </div>
    </div>
  );
};

export default function ProfileUidPage() {
  // 1. ВСЕ ХУКИ В НАЧАЛЕ КОМПОНЕНТА
  const { t } = useTranslation();
  const { uid: targetUid } = useParams<{ uid: string }>();
  const router = useRouter();
  const { user, userProfile, refreshUserProfile } = useAuth();
  const { toast } = useToast();

  const [targetProfile, setTargetProfile] = useState<UserProfile | null>(null);
  const [friendStatus, setFriendStatus] = useState<
    'none' | 'outgoing' | 'incoming' | 'friends'
  >('none');
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [oppFilter, setOppFilter] = useState('all');

  const [hasMounted, setHasMounted] = useState(false);

  // 2. ВСЕ ЭФФЕКТЫ ПОСЛЕ ХУКОВ СОСТОЯНИЯ
  useEffect(() => {
    setHasMounted(true);
  }, []);

  const isSelf = targetUid === user?.uid;

  useEffect(() => {
    if (!targetUid || !user) return;
    if (isSelf && userProfile) {
      setTargetProfile(userProfile);
      setNewName(userProfile.name ?? userProfile.displayName ?? '');
      setFriendStatus('none');
      return;
    }
    (async () => {
      const snap = await getDoc(doc(db, 'users', targetUid));
      if (!snap.exists()) {
        router.push('/profile');
        return;
      }
      const profileData = { uid: targetUid, ...(snap.data() as any) };
      setTargetProfile(profileData);
      setNewName(profileData.name ?? profileData.displayName ?? '');

      const mySnap = await getDoc(doc(db, 'users', user.uid));
      const myData = mySnap.exists() ? (mySnap.data() as any) : {};
      const incoming: string[] = myData.incomingRequests ?? [];
      const outgoing: string[] = myData.outgoingRequests ?? [];
      const friendsArr: string[] = myData.friends ?? [];

      if (friendsArr.includes(targetUid)) setFriendStatus('friends');
      else if (outgoing.includes(targetUid)) setFriendStatus('outgoing');
      else if (incoming.includes(targetUid)) setFriendStatus('incoming');
      else setFriendStatus('none');
    })();
  }, [targetUid, isSelf, user, userProfile, router]);

  const loadMatches = useCallback(async () => {
    if (!targetUid) return;
    setLoadingMatches(true);
    const ref = collection(db, 'matches');
    const [p1, p2] = await Promise.all([
      getDocs(query(ref, where('player1Id', '==', targetUid))),
      getDocs(query(ref, where('player2Id', '==', targetUid))),
    ]);
    const rows: Match[] = [];
    p1.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
    p2.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
    const uniq = Array.from(new Map(rows.map((r) => [r.id, r])).values()).sort(
      (a, b) =>
        parseFlexDate(b.timestamp ?? (b as any).playedAt).getTime() -
        parseFlexDate(a.timestamp ?? (a as any).playedAt).getTime()
    );
    setMatches(uniq);
    setLoadingMatches(false);
  }, [targetUid]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  // 3. ВСЕ ОБРАБОТЧИКИ И МЕМОИЗИРОВАННЫЕ ЗНАЧЕНИЯ
  const handleSaveName = async () => {
    if (!user || !newName.trim() || newName.trim().length < 3) {
      toast({
        title: t('Invalid Name'),
        description: t('Name must be at least 3 characters.'),
        variant: 'destructive',
      });
      return;
    }
    setIsSaving(true);
    try {
      await updateProfile(auth.currentUser!, { displayName: newName.trim() });
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        name: newName.trim(),
        displayName: newName.trim(),
      });
      setTargetProfile((prev) =>
        prev
          ? { ...prev, name: newName.trim(), displayName: newName.trim() }
          : null
      );
      if (refreshUserProfile) {
        await refreshUserProfile();
      }
      toast({
        title: t('Success!'),
        description: t('Your name has been updated.'),
      });
      setIsEditingName(false);
    } catch (error) {
      console.error('Error updating name:', error);
      toast({
        title: t('Error'),
        description: t('Could not update your name. Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdd = async () => {
    await Friends.sendFriendRequest(user!.uid, targetUid);
    setFriendStatus('outgoing');
    toast({ title: t('Request sent') });
  };
  const handleCancel = async () => {
    await Friends.cancelRequest(user!.uid, targetUid);
    setFriendStatus('none');
    toast({ title: t('Request canceled') });
  };
  const handleAccept = async () => {
    await Friends.acceptRequest(user!.uid, targetUid);
    setFriendStatus('friends');
    toast({ title: t('Friend added') });
  };
  const handleRemove = async () => {
    await Friends.unfriend(user!.uid, targetUid);
    setFriendStatus('none');
    toast({ title: t('Friend removed') });
  };

  const opponents = useMemo(() => {
    const m = new Map<string, string>();
    matches.forEach((match) => {
      const isP1 = match.player1Id === targetUid;
      m.set(
        isP1 ? match.player2Id : match.player1Id,
        isP1 ? match.player2.name : match.player1.name
      );
    });
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [matches, targetUid]);
  const filtered = useMemo(
    () =>
      oppFilter === 'all'
        ? matches
        : matches.filter(
            (m) => m.player1Id === oppFilter || m.player2Id === oppFilter
          ),
    [matches, oppFilter]
  );
  const stats = useMemo(
    () => computeStats(filtered, targetUid),
    [filtered, targetUid]
  );
  const sideStats = useMemo(
    () => computeSideStats(filtered, targetUid),
    [filtered, targetUid]
  );
  const monthly = useMemo(
    () => groupByMonth(filtered, targetUid),
    [filtered, targetUid]
  );
  const insights = useMemo(
    () => buildInsights(stats, sideStats, monthly, t),
    [stats, sideStats, monthly, t]
  );
  const oppStats = useMemo(
    () => opponentStats(matches, targetUid),
    [matches, targetUid]
  );
  const perfData = useMemo(
    () =>
      filtered.length
        ? filtered
            .slice()
            .sort(
              (a, b) =>
                parseFlexDate(a.timestamp ?? (a as any).playedAt).getTime() -
                parseFlexDate(b.timestamp ?? (b as any).playedAt).getTime()
            )
            .map((m) => {
              const isP1 = m.player1Id === targetUid;
              const me = isP1 ? m.player1 : m.player2;
              const opp = isP1 ? m.player2 : m.player1;
              return {
                label: safeFormatDate(
                  m.timestamp ?? (m as any).playedAt,
                  'dd.MM.yy'
                ),
                rating: me.newRating,
                diff: me.scores - opp.scores,
                result: me.scores > opp.scores ? 1 : -1,
                opponent: isP1 ? m.player2.name : m.player1.name,
                score: `${me.scores}–${opp.scores}`,
                addedPoints: me.addedPoints,
              };
            })
        : [
            {
              label: '',
              rating: targetProfile?.globalElo ?? 0,
              diff: 0,
              result: 0,
              opponent: '',
              score: '',
              addedPoints: 0,
            },
          ],
    [filtered, targetProfile]
  );
  const pieData = useMemo(
    () => [
      { name: t('Wins'), value: stats.wins, fill: 'hsl(var(--accent))' },
      {
        name: t('Losses'),
        value: stats.losses,
        fill: 'hsl(var(--destructive))',
      },
    ],
    [stats, t]
  );
  const sidePieData = useMemo(
    () => [
      {
        name: t('Left Wins'),
        value: sideStats.leftSideWins,
        fill: 'hsl(var(--accent))',
      },
      {
        name: t('Right Wins'),
        value: sideStats.rightSideWins,
        fill: 'hsl(var(--primary))',
      },
    ],
    [sideStats, t]
  );
  const sidePieLossData = useMemo(
    () => [
      {
        name: t('Left Losses'),
        value: sideStats.leftSideLosses,
        fill: 'hsl(var(--destructive))',
      },
      {
        name: t('Right Losses'),
        value: sideStats.rightSideLosses,
        fill: 'hsl(var(--primary))',
      },
    ],
    [sideStats, t]
  );

  // 4. УСЛОВНЫЕ ВОЗВРАТЫ (GUARDS)
  if (!hasMounted) {
    return null;
  }

  if (!targetProfile) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='animate-spin h-16 w-16 rounded-full border-b-4 border-primary' />
      </div>
    );
  }

  const displayName =
    targetProfile.displayName ?? targetProfile.name ?? t('Unknown Player');
  const rank = getRank(
    targetProfile.maxRating ?? targetProfile.globalElo ?? 1000,
    t
  );
  const medalSrc =
    medalMap[
      Object.keys(medalMap).find((key) => t(key) === rank) ??
        'Ping-Pong Padawan'
    ];

  // 5. ОСНОВНОЙ РЕНДЕР
  return (
    <section className='container mx-auto py-8 space-y-8'>
      <Card>
        <CardHeader className='flex flex-col md:flex-row md:justify-between items-center gap-6'>
          <div className='flex items-center gap-6'>
            <div className='relative'>
              <Avatar className='h-32 w-32'>
                <AvatarImage src={targetProfile.photoURL ?? undefined} />
                <AvatarFallback className='text-4xl'>
                  {displayName.charAt(0)}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className='text-left space-y-1'>
              <div className='flex items-center gap-3'>
                <CardTitle className='text-4xl'>{displayName}</CardTitle>
                {isSelf && (
                  <Dialog open={isEditingName} onOpenChange={setIsEditingName}>
                    <DialogTrigger asChild>
                      <Button variant='ghost' size='icon' className='h-8 w-8'>
                        <Pencil className='h-5 w-5' />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{t('Edit Your Name')}</DialogTitle>
                        <DialogDescription>
                          {t('This name will be visible to other players.')}
                        </DialogDescription>
                      </DialogHeader>
                      <div className='py-4'>
                        <Label htmlFor='newName'>{t('Display Name')}</Label>
                        <Input
                          id='newName'
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder={t('Your new name')}
                        />
                      </div>
                      <DialogFooter>
                        <Button
                          variant='outline'
                          onClick={() => setIsEditingName(false)}
                        >
                          {t('Cancel')}
                        </Button>
                        <Button onClick={handleSaveName} disabled={isSaving}>
                          {isSaving ? t('Saving...') : t('Save')}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
              {isSelf && (
                <CardDescription>{targetProfile.email}</CardDescription>
              )}
              <div className='inline-flex items-center gap-2 rounded-md bg-muted py-1 px-2 text-sm'>
                <span className='font-medium'>{rank}</span>
              </div>
              {!isSelf && (
                <div className='pt-2 flex gap-2'>
                  {friendStatus === 'none' && (
                    <Button onClick={handleAdd}>{t('Add Friend')}</Button>
                  )}
                  {friendStatus === 'outgoing' && (
                    <Button onClick={handleCancel}>
                      {t('Cancel Request')}
                    </Button>
                  )}
                  {friendStatus === 'incoming' && (
                    <Button onClick={handleAccept}>
                      {t('Accept Request')}
                    </Button>
                  )}
                  {friendStatus === 'friends' && (
                    <Button variant='destructive' onClick={handleRemove}>
                      {t('Remove Friend')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
          {medalSrc && (
            <img
              src={medalSrc}
              alt={rank}
              className='h-[140px] w-[140px] rounded-md'
            />
          )}
        </CardHeader>
      </Card>
      <div className='grid grid-cols-1 sm:grid-cols-4 gap-4'>
        <StatCard
          icon={LineChartIcon}
          label={t('Current ELO')}
          value={targetProfile.globalElo?.toFixed(0) ?? 'N/A'}
        />
        <StatCard icon={ListOrdered} label={t('Matches')} value={stats.total} />
        <StatCard
          icon={Percent}
          label={t('Win Rate')}
          value={`${stats.winRate.toFixed(1)}%`}
        />
        <StatCard
          icon={Flame}
          label={t('Max Streak')}
          value={stats.maxWinStreak}
        />
      </div>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch'>
        <div className='h-full'>
          <AchievementsPanel
            achievements={targetProfile?.achievements ?? []}
            overallMatches={stats.total}
            overallWins={stats.wins}
            overallWinRate={stats.winRate}
            overallMaxStreak={stats.maxWinStreak}
          />
        </div>
        <div className='flex flex-col gap-4'>
          <PieCard title={t('Win / Loss')} icon={PieChartIcon} data={pieData} />
          <div className='flex flex-row gap-4'>
            <PieCard
              title={t('Left vs Right Wins')}
              icon={PieChartIcon}
              data={sidePieData}
            />
            <PieCard
              title={t('Left vs Right Losses')}
              icon={PieChartIcon}
              data={sidePieLossData}
            />
          </div>
        </div>
      </div>
      <div className='flex items-center gap-4'>
        <span className='font-medium'>{t('Filter by Opponent')}:</span>
        <Select value={oppFilter} onValueChange={setOppFilter}>
          <SelectTrigger className='w-64'>
            <SelectValue placeholder={t('All Opponents')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>{t('All Opponents')}</SelectItem>
            {opponents.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DetailedStatsCard stats={stats} side={sideStats} t={t} />
      {insights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <LineChartIcon /> {t('Insights')}
            </CardTitle>
            <CardDescription>{t('Automatic game analysis')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className='space-y-3'>
              {insights.map((i, idx) => (
                <li key={idx} className='flex items-start gap-3'>
                  <i.icon className={`h-5 w-5 ${i.color} shrink-0`} />
                  <span dangerouslySetInnerHTML={{ __html: i.text }} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <div className='space-y-8'>
        <ChartCard title={t('ELO History')} icon={LineChartIcon}>
          <ResponsiveContainer width='100%' height={400}>
            <LineChart data={perfData}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis dataKey='label' tick={{ fontSize: 12 }} />
              <YAxis domain={['dataMin-20', 'dataMax+20']} />
              <RechartTooltip content={<CustomTooltip t={t} />} />
              <ReLegend />
              <Line
                type='monotone'
                dataKey='rating'
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Brush
                dataKey='label'
                height={20}
                travellerWidth={10}
                startIndex={Math.floor(perfData.length * 0.8)}
                endIndex={perfData.length - 1}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title={t('Monthly Δ ELO')} icon={LineChartIcon}>
          <ResponsiveContainer width='100%' height={300}>
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis dataKey='label' />
              <YAxis />
              <ReLegend />
              <RechartTooltip />
              <Line type='monotone' dataKey='delta' strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title={t('Match Result')} icon={Activity}>
          <ResponsiveContainer width='100%' height={450}>
            <LineChart data={perfData}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis dataKey='label' tick={{ fontSize: 12 }} />
              <YAxis domain={[-1.2, 1.2]} ticks={[-1, 0, 1]} />
              <RechartTooltip content={<CustomTooltip t={t} />} />
              <ReLegend />
              <Line
                type='stepAfter'
                dataKey='result'
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Brush
                dataKey='label'
                height={20}
                travellerWidth={10}
                startIndex={Math.floor(perfData.length * 0.8)}
                endIndex={perfData.length - 1}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title={t('Score Difference')} icon={TrendingUp}>
          <ResponsiveContainer width='100%' height={450}>
            <LineChart data={perfData}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis dataKey='label' tick={{ fontSize: 12 }} />
              <YAxis />
              <RechartTooltip content={<CustomTooltip t={t} />} />
              <ReLegend />
              <Line
                type='monotone'
                dataKey='diff'
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Brush
                dataKey='label'
                height={20}
                travellerWidth={10}
                startIndex={Math.floor(perfData.length * 0.8)}
                endIndex={perfData.length - 1}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <MatchesTableCard
        title={`${t('All Matches')} (${filtered.length})`}
        matches={filtered}
        loading={loadingMatches}
        meUid={targetUid}
        t={t}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t('Performance vs Opponents')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Opponent')}</TableHead>
                  <TableHead>{t('W / L')}</TableHead>
                  <TableHead>{t('Win %')}</TableHead>
                  <TableHead>{t('ELO Δ')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {oppStats.map((o) => (
                  <TableRow key={o.name}>
                    <TableCell>{o.name}</TableCell>
                    <TableCell>
                      {o.wins} / {o.losses}
                    </TableCell>
                    <TableCell>{o.winRate.toFixed(1)}%</TableCell>
                    <TableCell
                      className={
                        o.elo >= 0 ? 'text-accent' : 'text-destructive'
                      }
                    >
                      {o.elo > 0 ? `+${o.elo}` : o.elo}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </section>
  );
}

// --- Reusable Components ---
function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string | number;
}) {
  return (
    <Card>
      <CardContent className='p-4 flex items-center gap-4'>
        <Icon className='h-6 w-6 text-primary' />
        <div>
          <p className='text-sm text-muted-foreground'>{label}</p>
          <p className='text-2xl font-semibold'>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
function ChartCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Icon /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
function PieCard({
  title,
  icon: Icon,
  data,
}: {
  title: string;
  icon: any;
  data: { name: string; value: number; fill: string }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Icon /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className='h-[350px] w-full'>
        <ResponsiveContainer width='100%' height='100%'>
          <PieChart>
            <Pie
              data={data}
              dataKey='value'
              nameKey='name'
              cx='50%'
              cy='50%'
              outerRadius={80}
              label
            />
            <ReLegend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
function DetailedStatsCard({
  stats,
  side,
  t,
}: {
  stats: ReturnType<typeof computeStats>;
  side: ReturnType<typeof computeSideStats>;
  t: (key: string) => string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <CornerUpLeft /> / <CornerUpRight /> {t('Detailed Statistics')}
        </CardTitle>
      </CardHeader>
      <CardContent className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-sm'>
        <StatItem l={t('Matches')} v={stats.total} />
        <StatItem
          l={t('Wins / Losses')}
          v={`${stats.wins} / ${stats.losses}`}
        />
        <StatItem l={t('Win Rate')} v={`${stats.winRate.toFixed(2)}%`} />
        <StatItem l={t('Best Win Margin')} v={stats.bestWinMargin} />
        <StatItem l={t('Worst Loss Margin')} v={stats.worstLossMargin} />
        <StatItem l={t('Points Scored')} v={stats.pointsScored} />
        <StatItem l={t('Points Conceded')} v={stats.pointsConceded} />
        <StatItem l={t('Point Diff')} v={stats.pointsDiff} />
        <StatItem l={t('Max Win Streak')} v={stats.maxWinStreak} />
        <StatItem l={t('Max Loss Streak')} v={stats.maxLossStreak} />
        <StatItem
          l={t('Left Side W/L')}
          v={`${side.leftSideWins} / ${side.leftSideLosses}`}
        />
        <StatItem
          l={t('Right Side W/L')}
          v={`${side.rightSideWins} / ${side.rightSideLosses}`}
        />
      </CardContent>
    </Card>
  );
}
function StatItem({ l, v }: { l: string; v: React.ReactNode }) {
  return (
    <div>
      <p className='font-semibold'>{l}</p>
      {v}
    </div>
  );
}
function MatchesTableCard({
  title,
  matches,
  loading,
  meUid,
  t,
}: {
  title: string;
  matches: Match[];
  loading: boolean;
  meUid: string;
  t: (key: string) => string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className='text-center py-8'>{t('Loading…')}</div>
        ) : matches.length === 0 ? (
          <p className='text-center py-8'>{t('No matches found.')}</p>
        ) : (
          <ScrollArea className='h-[400px]'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Date')}</TableHead>
                  <TableHead>{t('Opponent')}</TableHead>
                  <TableHead>{t('Score')}</TableHead>
                  <TableHead>{t('Result')}</TableHead>
                  <TableHead>{t('ELO Δ')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matches.map((m) => {
                  const isP1 = m.player1Id === meUid;
                  const date = safeFormatDate(
                    m.timestamp ?? (m as any).playedAt,
                    'dd.MM.yyyy HH.mm.ss'
                  );
                  const opp = isP1 ? m.player2.name : m.player1.name;
                  const myScore = isP1 ? m.player1.scores : m.player2.scores;
                  const theirScore = isP1 ? m.player2.scores : m.player1.scores;
                  const eloΔ = isP1
                    ? m.player1.addedPoints
                    : m.player2.addedPoints;
                  const win = myScore > theirScore;
                  return (
                    <TableRow key={m.id}>
                      <TableCell>{date}</TableCell>
                      <TableCell>{opp}</TableCell>
                      <TableCell>
                        {myScore} – {theirScore}
                      </TableCell>
                      <TableCell
                        className={win ? 'text-accent' : 'text-destructive'}
                      >
                        {win ? t('Win') : t('Loss')}
                      </TableCell>
                      <TableCell
                        className={
                          eloΔ >= 0 ? 'text-accent' : 'text-destructive'
                        }
                      >
                        {eloΔ > 0 ? `+${eloΔ}` : eloΔ}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
function FriendChip({ uid }: { uid: string }) {
  const [info, setInfo] = useState<{ name?: string; photoURL?: string } | null>(
    null
  );
  useEffect(() => {
    Friends.getUserLite(uid).then(setInfo);
  }, [uid]);
  if (!info?.name) return null;
  return (
    <Link
      href={`/profile/${uid}`}
      className='inline-flex items-center gap-2 px-3 py-1 rounded-md bg-muted hover:bg-muted/70'
    >
      <Avatar className='h-6 w-6'>
        {info.photoURL ? (
          <AvatarImage src={info.photoURL} />
        ) : (
          <AvatarFallback>{info.name.charAt(0)}</AvatarFallback>
        )}
      </Avatar>
      <span className='text-sm'>{info.name}</span>
    </Link>
  );
}
