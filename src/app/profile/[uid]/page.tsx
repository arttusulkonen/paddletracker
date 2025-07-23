'use client';

import AchievementsPanel from '@/components/AchievementsPanel';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { auth, db, storage } from '@/lib/firebase';
import * as Friends from '@/lib/friends';
import type { Match, Room, UserProfile } from '@/lib/types';
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
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import {
  Activity,
  ArrowLeftRight,
  CornerUpLeft,
  CornerUpRight,
  Flame,
  LineChart as LineChartIcon,
  ListOrdered,
  Lock,
  Percent,
  PieChart as PieChartIcon,
  Settings,
  TrendingDown,
  TrendingUp,
  UserX,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
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
    rightSideLosses = 0;
  list.forEach((m) => {
    const isP1 = m.player1Id === uid;
    const me = isP1 ? m.player1 : m.player2;
    const opp = isP1 ? m.player2 : m.player1;
    const win = me.scores > opp.scores;
    if (me.side === 'left') {
      win ? leftSideWins++ : leftSideLosses++;
    } else if (me.side === 'right') {
      win ? rightSideWins++ : rightSideLosses++;
    }
  });
  return { leftSideWins, leftSideLosses, rightSideWins, rightSideLosses };
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
  const { t } = useTranslation();
  const { uid: targetUid } = useParams<{ uid: string }>();
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const { toast } = useToast();

  const [targetProfile, setTargetProfile] = useState<UserProfile | null>(null);
  const [friendStatus, setFriendStatus] = useState<
    'none' | 'outgoing' | 'incoming' | 'friends'
  >('none');
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [oppFilter, setOppFilter] = useState('all');
  const [roomData, setRoomData] = useState<Map<string, Room>>(new Map());

  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const isSelf = targetUid === user?.uid;

  const fetchProfileData = useCallback(async () => {
    if (!targetUid || !db) return;

    if (isSelf && userProfile) {
      setTargetProfile(userProfile);
      return;
    }

    const snap = await getDoc(doc(db, 'users', targetUid));
    if (!snap.exists() || snap.data()?.isDeleted) {
      toast({ title: t('Profile not found'), variant: 'destructive' });
      router.push('/');
      return;
    }
    const profileData = { uid: targetUid, ...(snap.data() as UserProfile) };
    setTargetProfile(profileData);

    if (user && userProfile && !isSelf) {
      if (userProfile.friends?.includes(targetUid)) setFriendStatus('friends');
      else if (userProfile.outgoingRequests?.includes(targetUid))
        setFriendStatus('outgoing');
      else if (userProfile.incomingRequests?.includes(targetUid))
        setFriendStatus('incoming');
      else setFriendStatus('none');
    }
  }, [targetUid, isSelf, user, userProfile, router, t, toast]);

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

  const loadMatchesAndRooms = useCallback(async () => {
    if (!targetUid || !db) return;
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

    const roomIds = [...new Set(uniq.map((m) => m.roomId).filter(Boolean))];
    if (roomIds.length > 0) {
      const roomSnaps = await Promise.all(
        roomIds.map((id) => getDoc(doc(db, 'rooms', id!)))
      );
      const roomMap = new Map<string, Room>();
      roomSnaps.forEach((snap) => {
        if (snap.exists()) {
          roomMap.set(snap.id, { id: snap.id, ...snap.data() } as Room);
        }
      });
      setRoomData(roomMap);
    }

    setAllMatches(uniq);
    setLoadingMatches(false);
  }, [targetUid]);

  useEffect(() => {
    if (targetProfile) {
      loadMatchesAndRooms();
    }
  }, [targetProfile, loadMatchesAndRooms]);

  const visibleMatches = useMemo(() => {
    if (isSelf) return allMatches;
    return allMatches.filter((m) => {
      const room = roomData.get(m.roomId!);
      if (!room) return false;
      if (room.isPublic) return true;
      return userProfile?.rooms?.includes(room.id);
    });
  }, [allMatches, roomData, userProfile, isSelf]);

  const handleAdd = async () => {
    if (!user) return;
    await Friends.sendFriendRequest(user.uid, targetUid);
    setFriendStatus('outgoing');
    toast({ title: t('Request sent') });
  };
  const handleCancel = async () => {
    if (!user) return;
    await Friends.cancelRequest(user.uid, targetUid);
    setFriendStatus('none');
    toast({ title: t('Request canceled') });
  };
  const handleAccept = async () => {
    if (!user) return;
    await Friends.acceptRequest(user.uid, targetUid);
    setFriendStatus('friends');
    toast({ title: t('Friend added') });
  };
  const handleRemove = async () => {
    if (!user) return;
    await Friends.unfriend(user.uid, targetUid);
    setFriendStatus('none');
    toast({ title: t('Friend removed') });
  };

  const opponents = useMemo(() => {
    const m = new Map<string, string>();
    visibleMatches.forEach((match) => {
      const isP1 = match.player1Id === targetUid;
      m.set(
        isP1 ? match.player2Id : match.player1Id,
        isP1 ? match.player2.name : match.player1.name
      );
    });
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [visibleMatches, targetUid]);

  const filtered = useMemo(
    () =>
      oppFilter === 'all'
        ? visibleMatches
        : visibleMatches.filter(
            (m) => m.player1Id === oppFilter || m.player2Id === oppFilter
          ),
    [visibleMatches, oppFilter]
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
    () => opponentStats(filtered, targetUid),
    [filtered, targetUid]
  );
  const perfData = useMemo(
    () =>
      filtered.length
        ? filtered
            .slice()
            .reverse()
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
    [filtered, targetUid, targetProfile]
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

  const canViewProfile =
    targetProfile.isPublic || friendStatus === 'friends' || isSelf;

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
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant='outline' size='icon'>
                        <Settings className='h-5 w-5' />
                      </Button>
                    </DialogTrigger>
                    <ProfileSettingsDialog
                      profile={targetProfile}
                      friends={userProfile?.friends ?? []}
                      onUpdate={fetchProfileData}
                    />
                  </Dialog>
                )}
              </div>
              {isSelf && (
                <CardDescription>{targetProfile.email}</CardDescription>
              )}
              {targetProfile.bio && canViewProfile && (
                <p className='text-sm text-muted-foreground pt-1 max-w-lg'>
                  {targetProfile.bio}
                </p>
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

      {!canViewProfile ? (
        <Card>
          <CardContent className='py-12 flex flex-col items-center justify-center text-center'>
            <Lock className='h-12 w-12 text-muted-foreground mb-4' />
            <h3 className='text-xl font-semibold'>
              {t('This Profile is Private')}
            </h3>
            <p className='text-muted-foreground mt-2'>
              {t('Add this player as a friend to view their stats.')}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className='grid grid-cols-1 sm:grid-cols-4 gap-4'>
            <StatCard
              icon={LineChartIcon}
              label={t('Current ELO')}
              value={targetProfile.globalElo?.toFixed(0) ?? 'N/A'}
            />
            <StatCard
              icon={ListOrdered}
              label={t('Matches')}
              value={stats.total}
            />
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
        </>
      )}
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

function ProfileSettingsDialog({
  profile,
  friends: friendIds,
  onUpdate,
}: {
  profile: UserProfile;
  friends: string[];
  onUpdate: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { logout } = useAuth();
  const [name, setName] = useState(profile.displayName ?? profile.name ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [isPublic, setIsPublic] = useState(profile.isPublic ?? true);
  const [friends, setFriends] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(
    profile.photoURL ?? null
  );
  const [crop, setCrop] = useState<Crop>();
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [scale, setScale] = useState(1);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const fetchFriends = async () => {
      if (!db) return;
      const friendProfiles = await Promise.all(
        friendIds.map((id) => Friends.getUserLite(id))
      );
      setFriends(friendProfiles.filter(Boolean));
    };
    fetchFriends();
  }, [friendIds]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        toast({
          title: t('File is too large'),
          description: t('Please select an image smaller than 1MB.'),
          variant: 'destructive',
        });
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.addEventListener('load', () =>
        setImagePreview(reader.result as string)
      );
      reader.readAsDataURL(file);
      setIsEditingImage(true);
    }
  };

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const initialCrop = centerCrop(
      makeAspectCrop({ unit: '%', width: 90 }, 1, width, height),
      width,
      height
    );
    setCrop(initialCrop);
  };

  const handleSave = async () => {
    if (!profile || !db || !storage) {
      toast({
        title: t('Connection Error'),
        description: t('Could not connect to the database.'),
        variant: 'destructive',
      });
      return;
    }
    setIsSaving(true);
    console.log('1. Starting save. Profile UID:', profile.uid);

    try {
      let photoURL = profile.photoURL;
      console.log('2. Initial photoURL:', photoURL);

      if (imageFile) {
        console.log('3. Image file found, starting upload...');
        const storageRef = ref(
          storage,
          `avatars/${profile.uid}/${imageFile.name}`
        );
        await uploadBytes(storageRef, imageFile);
        photoURL = await getDownloadURL(storageRef);
        console.log('4. Upload complete. New photoURL:', photoURL);
      }

      const updatedData = {
        name: name.trim(),
        displayName: name.trim(),
        bio: bio.trim(),
        isPublic,
        photoURL: photoURL ?? null,
        avatarCrop: crop
          ? {
              x: crop.x,
              y: crop.y,
              width: crop.width,
              height: crop.height,
              scale,
            }
          : null,
      };

      console.log('5. Data to be saved:', updatedData);
      console.log('6. Document path:', `users/${profile.uid}`);

      await updateDoc(doc(db, 'users', profile.uid), updatedData);
      console.log('7. Firestore document updated.');

      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: name.trim(),
          photoURL: photoURL ?? null,
        });
        console.log('8. Firebase Auth profile updated.');
      }

      toast({ title: t('Profile updated successfully!') });
      onUpdate();
    } catch (error) {
      console.error('Profile update error:', error);
      toast({ title: t('Failed to update profile'), variant: 'destructive' });
    } finally {
      setIsSaving(false);
      console.log('9. Save process finished.');
    }
  };

  const handleAccountDelete = async () => {
    if (!profile || !db) return;
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        name: t('Deleted Player'),
        displayName: t('Deleted Player'),
        email: `deleted-${profile.uid}@deleted.com`,
        photoURL: null,
        bio: '',
        friends: [],
        incomingRequests: [],
        outgoingRequests: [],
      });
      toast({
        title: t('Account deleted'),
        description: t('You will be logged out.'),
      });
      if (logout) {
        await logout();
      }
      router.push('/');
    } catch (error) {
      toast({ title: t('Failed to delete account'), variant: 'destructive' });
    }
  };

  return (
    <DialogContent className='max-w-3xl'>
      <DialogHeader>
        <DialogTitle>{t('Profile Settings')}</DialogTitle>
      </DialogHeader>
      <div className='py-4 grid grid-cols-1 md:grid-cols-2 gap-8'>
        <div className='space-y-4'>
          <h3 className='font-semibold'>{t('General')}</h3>
          <div className='space-y-2'>
            <Label>{t('Profile Picture')}</Label>
            <div className='flex items-center gap-4'>
              <Avatar className='h-20 w-20'>
                <AvatarImage
                  src={imagePreview ?? profile.photoURL ?? undefined}
                />
                <AvatarFallback>{name.charAt(0)}</AvatarFallback>
              </Avatar>
              <Input
                id='picture'
                type='file'
                accept='image/png, image/jpeg'
                onChange={handleImageChange}
                className='max-w-xs'
              />
            </div>
            {isEditingImage && imagePreview && (
              <Dialog open={isEditingImage} onOpenChange={setIsEditingImage}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('Edit your new picture')}</DialogTitle>
                    <DialogDescription>
                      {t('Adjust the zoom and position of your avatar.')}
                    </DialogDescription>
                  </DialogHeader>
                  <div className='p-2 border rounded-md'>
                    <ReactCrop
                      crop={crop}
                      onChange={(c) => setCrop(c)}
                      aspect={1}
                      circularCrop
                    >
                      <img
                        ref={imgRef}
                        src={imagePreview}
                        alt='Crop preview'
                        style={{ transform: `scale(${scale})` }}
                        onLoad={onImageLoad}
                      />
                    </ReactCrop>
                  </div>
                  <div className='space-y-2'>
                    <Label>{t('Zoom')}</Label>
                    <Slider
                      defaultValue={[1]}
                      min={1}
                      max={3}
                      step={0.1}
                      onValueChange={(value) => setScale(value[0])}
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      variant='outline'
                      onClick={() => setIsEditingImage(false)}
                    >
                      {t('Cancel')}
                    </Button>
                    <Button onClick={() => setIsEditingImage(false)}>
                      {t('Apply')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
          <div className='space-y-2'>
            <Label htmlFor='name'>{t('Display Name')}</Label>
            <Input
              id='name'
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='bio'>{t('About Me')}</Label>
            <Textarea
              id='bio'
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={t('Tell others a little about yourself...')}
            />
          </div>
          <div className='flex items-center space-x-2'>
            <Checkbox
              id='isPublic'
              checked={isPublic}
              onCheckedChange={(v) => setIsPublic(!!v)}
            />
            <Label htmlFor='isPublic'>{t('Public Profile')}</Label>
          </div>
        </div>
        <div className='space-y-6'>
          <div>
            <h3 className='font-semibold mb-2'>{t('Friends')}</h3>
            <ScrollArea className='h-48 border rounded-md p-2'>
              {friends.length > 0 ? (
                friends.map((f) => (
                  <div
                    key={f.uid}
                    className='flex items-center justify-between p-1 hover:bg-muted rounded'
                  >
                    <span>{f.name}</span>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='h-7 w-7'
                      onClick={async () => {
                        await Friends.unfriend(profile.uid, f.uid);
                        setFriends((current) =>
                          current.filter((fr) => fr.uid !== f.uid)
                        );
                        toast({ title: t('Friend removed') });
                      }}
                    >
                      <UserX className='h-4 w-4 text-destructive' />
                    </Button>
                  </div>
                ))
              ) : (
                <p className='text-sm text-muted-foreground p-2'>
                  {t('No friends yet.')}
                </p>
              )}
            </ScrollArea>
          </div>
          <div className='space-y-2 p-4 border border-destructive/50 rounded-md'>
            <h4 className='font-medium text-destructive'>{t('Danger Zone')}</h4>
            <p className='text-sm text-muted-foreground'>
              {t(
                'This action cannot be undone. All your personal data will be removed.'
              )}
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant='destructive' className='w-full'>
                  {t('Delete Account')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t('Are you absolutely sure?')}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t(
                      'This will permanently delete your account and remove all personal information. Your match history will be anonymized.'
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleAccountDelete}>
                    {t('Yes, Delete My Account')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? t('Saving...') : t('Save Changes')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

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
  viewerId,
  t,
}: {
  title: string;
  matches: Match[];
  loading: boolean;
  meUid: string;
  viewerId: string | undefined;
  t: (key: string) => string;
}) {
  const [roomData, setRoomData] = useState<Map<string, Room>>(new Map());
  const { userProfile: viewerProfile } = useAuth();

  useEffect(() => {
    const fetchRoomData = async () => {
      if (!db || matches.length === 0) return;
      const roomIds = [
        ...new Set(matches.map((m) => m.roomId).filter(Boolean)),
      ];

      const newIdsToFetch = roomIds.filter((id) => !roomData.has(id!));
      if (newIdsToFetch.length === 0) return;

      const newRoomData = new Map<string, Room>();
      for (const roomId of newIdsToFetch) {
        const roomSnap = await getDoc(doc(db, 'rooms', roomId!));
        if (roomSnap.exists()) {
          newRoomData.set(roomId!, { id: roomId, ...roomSnap.data() } as Room);
        }
      }
      if (newRoomData.size > 0) {
        setRoomData((prev) => new Map([...prev, ...newRoomData]));
      }
    };
    fetchRoomData();
  }, [matches, roomData]);

  const visibleMatches = useMemo(() => {
    return matches.filter((m) => {
      const room = roomData.get(m.roomId!);
      if (!room) return false;
      if (room.isPublic) return true;
      return viewerProfile?.rooms?.includes(room.id);
    });
  }, [matches, roomData, viewerProfile]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className='text-center py-8'>{t('Loading…')}</div>
        ) : visibleMatches.length === 0 ? (
          <p className='text-center py-8'>{t('No visible matches found.')}</p>
        ) : (
          <ScrollArea className='h-[400px]'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Date')}</TableHead>
                  <TableHead>{t('Opponent')}</TableHead>
                  <TableHead>{t('Room')}</TableHead>
                  <TableHead>{t('Score')}</TableHead>
                  <TableHead>{t('Result')}</TableHead>
                  <TableHead>{t('ELO Δ')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleMatches.map((m) => {
                  const room = roomData.get(m.roomId!);
                  const isP1 = m.player1Id === meUid;
                  const date = safeFormatDate(
                    m.timestamp ?? (m as any).playedAt,
                    'dd.MM.yyyy HH:mm:ss'
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
                        {room && <Badge variant='outline'>{room.name}</Badge>}
                      </TableCell>
                      <TableCell>
                        {myScore} – {theirScore}
                      </TableCell>
                      <TableCell
                        className={win ? 'text-green-600' : 'text-destructive'}
                      >
                        {win ? t('Win') : t('Loss')}
                      </TableCell>
                      <TableCell
                        className={
                          eloΔ >= 0 ? 'text-green-600' : 'text-destructive'
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
