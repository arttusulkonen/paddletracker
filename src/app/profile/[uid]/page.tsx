'use client';

import { ProfileContent } from '@/components/profile/ProfileContent';
import { ProfileSettingsDialog } from '@/components/profile/ProfileSettingsDialog';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogTrigger,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import * as Friends from '@/lib/friends';
import type { Match, Room, UserProfile } from '@/lib/types';
import { parseFlexDate, safeFormatDate } from '@/lib/utils/date';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import {
  ArrowLeftRight,
  Flame,
  Settings,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

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

export default function ProfileUidPage() {
  const { t } = useTranslation();
  const { uid: targetUid } = useParams<{ uid: string }>();
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const { sport, config, loading: sportLoading } = useSport();
  const { toast } = useToast();

  const [targetProfile, setTargetProfile] = useState<UserProfile | null>(null);
  const [friendStatus, setFriendStatus] = useState<
    'none' | 'outgoing' | 'incoming' | 'friends'
  >('none');
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [oppFilter, setOppFilter] = useState('all');

  const isSelf = targetUid === user?.uid;
  const sportProfile = targetProfile?.sports?.[sport];

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

  const loadMatches = useCallback(async () => {
    if (!targetUid || !config) return;
    setLoading(true);
    const matchesRef = collection(db, config.collections.matches);
    const q = query(matchesRef, where('players', 'array-contains', targetUid));
    const snapshot = await getDocs(q);
    const rows: Match[] = snapshot.docs.map(
      (d) => ({ id: d.id, ...d.data() } as Match)
    );
    rows.sort(
      (a, b) =>
        parseFlexDate(b.tsIso).getTime() - parseFlexDate(a.tsIso).getTime()
    );
    setAllMatches(rows);
    setLoading(false);
  }, [targetUid, config]);

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

  useEffect(() => {
    if (targetProfile && config) loadMatches();
  }, [targetProfile, config, loadMatches]);

  const handleFriendAction = async (
    action: 'add' | 'cancel' | 'accept' | 'remove'
  ) => {
    if (!user) return;
    try {
      switch (action) {
        case 'add':
          await Friends.sendFriendRequest(user.uid, targetUid);
          setFriendStatus('outgoing');
          toast({ title: t('Request sent') });
          break;
        case 'cancel':
          await Friends.cancelRequest(user.uid, targetUid);
          setFriendStatus('none');
          toast({ title: t('Request canceled') });
          break;
        case 'accept':
          await Friends.acceptRequest(user.uid, targetUid);
          setFriendStatus('friends');
          toast({ title: t('Friend added') });
          break;
        case 'remove':
          await Friends.unfriend(user.uid, targetUid);
          setFriendStatus('none');
          toast({ title: t('Friend removed') });
          break;
      }
    } catch (error) {
      toast({
        title: t('Error'),
        description: t('Something went wrong'),
        variant: 'destructive',
      });
    }
  };

  const filteredMatches = useMemo(
    () =>
      oppFilter === 'all'
        ? allMatches
        : allMatches.filter(
            (m) => m.player1Id === oppFilter || m.player2Id === oppFilter
          ),
    [allMatches, oppFilter]
  );

  const rankedMatches = useMemo(
    () => filteredMatches.filter((match) => match.isRanked !== false),
    [filteredMatches]
  );

  const stats = useMemo(
    () => computeStats(rankedMatches, targetUid),
    [rankedMatches, targetUid]
  );

  const sideStats = useMemo(
    () => computeSideStats(rankedMatches, targetUid),
    [rankedMatches, targetUid]
  );

  const monthlyData = useMemo(
    () => groupByMonth(rankedMatches, targetUid),
    [rankedMatches, targetUid]
  );

  const insights = useMemo(
    () => buildInsights(stats, sideStats, monthlyData, t),
    [stats, sideStats, monthlyData, t]
  );

  const opponents = useMemo(() => {
    const m = new Map<string, string>();
    allMatches.forEach((match) => {
      const isP1 = match.player1Id === targetUid;
      m.set(
        isP1 ? match.player2Id : match.player1Id,
        isP1 ? match.player2.name : match.player1.name
      );
    });
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [allMatches, targetUid]);

  const oppStats = useMemo(
    () => opponentStats(rankedMatches, targetUid),
    [rankedMatches, targetUid]
  );

  const perfData = useMemo(
    () =>
      rankedMatches.length
        ? rankedMatches
            .slice()
            .reverse()
            .map((m) => {
              const isP1 = m.player1Id === targetUid;
              const me = isP1 ? m.player1 : m.player2;
              const opp = isP1 ? m.player2 : m.player1;
              return {
                label: safeFormatDate(m.tsIso, 'dd.MM.yy'),
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
              rating: sportProfile?.globalElo ?? 1000,
              diff: 0,
              result: 0,
              opponent: '',
              score: '',
              addedPoints: 0,
            },
          ],
    [rankedMatches, targetUid, sportProfile]
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

  if (loading || sportLoading || !targetProfile || !config) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='animate-spin h-16 w-16 rounded-full border-b-4 border-primary' />
      </div>
    );
  }

  const displayName =
    targetProfile.displayName ?? targetProfile.name ?? t('Unknown Player');
  const rank = getRank(sportProfile?.globalElo ?? 1000, t);
  const medalKey =
    Object.keys(medalMap).find((key) => t(key) === rank) ?? 'Ping-Pong Padawan';
  const medalSrc = medalMap[medalKey];

  return (
    <section className='container mx-auto py-8 space-y-8'>
      <Card>
        <CardHeader className='flex flex-col md:flex-row md:justify-between items-center gap-6'>
          <div className='flex items-center gap-6'>
            <Avatar className='h-32 w-32'>
              <AvatarImage src={targetProfile.photoURL ?? undefined} />
              <AvatarFallback className='text-4xl'>
                {displayName.charAt(0)}
              </AvatarFallback>
            </Avatar>
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
              {targetProfile.bio &&
                (targetProfile.isPublic ||
                  friendStatus === 'friends' ||
                  isSelf) && (
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
                    <Button onClick={() => handleFriendAction('add')}>
                      {t('Add Friend')}
                    </Button>
                  )}
                  {friendStatus === 'outgoing' && (
                    <Button onClick={() => handleFriendAction('cancel')}>
                      {t('Cancel Request')}
                    </Button>
                  )}
                  {friendStatus === 'incoming' && (
                    <Button onClick={() => handleFriendAction('accept')}>
                      {t('Accept Request')}
                    </Button>
                  )}
                  {friendStatus === 'friends' && (
                    <Button
                      variant='destructive'
                      onClick={() => handleFriendAction('remove')}
                    >
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

      <ProfileContent
        canViewProfile={
          targetProfile.isPublic || friendStatus === 'friends' || isSelf
        }
        stats={stats}
        sportProfile={sportProfile}
        sideStats={sideStats}
        pieData={pieData}
        sidePieData={sidePieData}
        sidePieLossData={sidePieLossData}
        insights={insights}
        perfData={perfData}
        monthlyData={monthlyData}
        opponents={opponents}
        oppFilter={oppFilter}
        setOppFilter={setOppFilter}
        filteredMatches={filteredMatches}
        loadingMatches={loading}
        meUid={targetUid}
        config={config}
        oppStats={oppStats}
        targetProfile={targetProfile}
      />
    </section>
  );
}
