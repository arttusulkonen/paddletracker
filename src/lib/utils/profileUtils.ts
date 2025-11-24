// src/lib/utils/profileUtils.ts
import type { Match, UserProfile } from '@/lib/types';
import {
  ArrowLeftRight,
  Crosshair,
  Flame,
  HeartCrack,
  LineChart,
  Rocket,
  Skull,
  TrendingDown,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { parseFlexDate } from './date';

export const getRank = (elo: number, t: (key: string) => string) =>
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

export const medalMap: Record<string, string> = {
  'Ping-Pong Padawan': '/img/ping-pong-padawan.png',
  'Table-Tennis Trainee': '/img/table-tennis-trainee.png',
  'Racket Rookie': '/img/racket-rookie.png',
  'Paddle Prodigy': '/img/paddle-prodigy.png',
  'Spin Sensei': '/img/spin-sensei.png',
  'Smash Samurai': '/img/smash-samurai.png',
  'Ping-Pong Paladin': '/img/ping-pong-paladin.png',
};

export function computeStats(list: Match[], uid: string) {
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

export function computeTennisStats(
  list: Match[],
  uid: string,
  profile: UserProfile | null,
  sport: 'tennis'
) {
  let aces = 0,
    doubleFaults = 0,
    winners = 0;
  list.forEach((m) => {
    const isP1 = m.player1Id === uid;
    const me = isP1 ? m.player1 : m.player2;
    aces += Number(
      (me as any).aces ?? (me as any).aces1 ?? (me as any).aces2 ?? 0
    );
    doubleFaults += Number(
      (me as any).doubleFaults ??
        (me as any).doubleFaults1 ??
        (me as any).doubleFaults2 ??
        0
    );
    winners += Number(
      (me as any).winners ?? (me as any).winners1 ?? (me as any).winners2 ?? 0
    );
  });
  const profileStats = profile?.sports?.[sport];
  return {
    aces: profileStats?.aces ?? aces,
    doubleFaults: profileStats?.doubleFaults ?? doubleFaults,
    winners: profileStats?.winners ?? winners,
  };
}

export function computeSideStats(list: Match[], uid: string) {
  let leftSideWins = 0,
    leftSideLosses = 0,
    rightSideWins = 0,
    rightSideLosses = 0;
  list.forEach((m) => {
    const isP1 = m.player1Id === uid;
    const me = isP1 ? m.player1 : m.player2;
    const opp = isP1 ? m.player2 : m.player1;
    const win = me.scores > opp.scores;
    if ((me as any).side === 'left') {
      win ? leftSideWins++ : leftSideLosses++;
    } else if ((me as any).side === 'right') {
      win ? rightSideWins++ : rightSideLosses++;
    }
  });
  return { leftSideWins, leftSideLosses, rightSideWins, rightSideLosses };
}

export function groupByMonth(list: Match[], uid: string) {
  const map = new Map<string, { start: number; end: number }>();

  // Сортировка по возрастанию даты
  const sorted = [...list].sort((a, b) => {
    return (
      parseFlexDate(a.tsIso ?? a.timestamp).getTime() -
      parseFlexDate(b.tsIso ?? b.timestamp).getTime()
    );
  });

  sorted.forEach((m) => {
    const d = parseFlexDate(m.tsIso ?? m.timestamp ?? (m as any).playedAt);
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

export function opponentStats(list: Match[], uid: string) {
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

const pct = (v: number) => `${v.toFixed(0)}%`;

// Вспомогательная функция для жирного текста, чтобы не писать каждый раз
const bold = (v: string | number) => `<b>${v}</b>`;

export function buildInsights(
  matches: Match[],
  meUid: string,
  stats: any,
  sideStats: any,
  monthly: any[],
  t: (key: string, options?: any) => string
): any[] {
  const rows: any[] = [];
  const validRanked = matches.filter((m) => m.isRanked !== false);

  // --- 1. CHASING GREATNESS (PEAK ELO) ---
  let maxElo = 1000;
  let currentElo = 1000;

  validRanked.forEach((m) => {
    const isP1 = m.player1Id === meUid;
    const rating = isP1 ? m.player1.newRating : m.player2.newRating;
    if (rating > maxElo) maxElo = rating;
  });

  if (validRanked.length > 0) {
    const sortedDesc = [...validRanked].sort(
      (a, b) =>
        parseFlexDate(b.tsIso ?? b.timestamp).getTime() -
        parseFlexDate(a.tsIso ?? a.timestamp).getTime()
    );
    const lastMatch = sortedDesc[0];
    currentElo =
      lastMatch.player1Id === meUid
        ? lastMatch.player1.newRating
        : lastMatch.player2.newRating;
  }

  const eloDiff = maxElo - currentElo;

  if (maxElo > 1050) {
    if (currentElo >= maxElo) {
      rows.push({
        icon: Trophy,
        color: 'text-amber-500',
        bg: 'bg-amber-100 dark:bg-amber-900/20',
        title: t('Peak Performance'),
        description: t(
          'You are currently at your all-time high ELO ({{elo}}). Unstoppable!',
          {
            elo: bold(Math.round(currentElo)),
            interpolation: { escapeValue: false },
          }
        ),
      });
    } else if (eloDiff > 0) {
      rows.push({
        icon: LineChart,
        color: 'text-blue-600',
        bg: 'bg-blue-100 dark:bg-blue-900/20',
        title: t('Chasing Greatness'),
        // Теперь ключи перевода чистые, а HTML теги добавляются только вокруг значений
        description: t(
          'Peak: {{max}}. Current: {{curr}}. You need {{diff}} pts to break your record.',
          {
            max: bold(Math.round(maxElo)),
            curr: bold(Math.round(currentElo)),
            diff: bold(Math.round(eloDiff)),
            interpolation: { escapeValue: false },
          }
        ),
      });
    }
  }

  // --- 2. MONTHLY MOMENTUM ---
  const thisMonth =
    monthly.length > 0 ? monthly[monthly.length - 1] : undefined;
  const prevMonth =
    monthly.length > 1 ? monthly[monthly.length - 2] : undefined;

  if (thisMonth) {
    const delta = Math.round(thisMonth.delta);
    const isPositive = delta >= 0;

    let comparisonText = '';

    if (prevMonth) {
      const prevDelta = prevMonth.delta;
      if (isPositive && prevDelta > 0) {
        if (delta > prevDelta) {
          const increase = Math.round(((delta - prevDelta) / prevDelta) * 100);
          comparisonText = t("That's {{pct}}% better than last month!", {
            pct: bold(increase),
            interpolation: { escapeValue: false },
          });
        } else {
          comparisonText = t('Consistent growth, keep it up.');
        }
      } else if (isPositive && prevDelta < 0) {
        comparisonText = t('Huge turnaround from last month!');
      } else if (!isPositive) {
        comparisonText = t('Tough month, but you will bounce back.');
      }
    }

    // Собираем строку из двух частей перевода, чтобы не тащить HTML структуру в ключи
    const mainTextKey = isPositive
      ? 'Gained {{points}} ELO this month.'
      : 'Net change {{points}} ELO this month.';

    const mainText = t(mainTextKey, {
      points: bold(delta),
      interpolation: { escapeValue: false },
    });

    rows.push({
      icon: isPositive ? TrendingUp : TrendingDown,
      color: isPositive ? 'text-emerald-600' : 'text-rose-600',
      bg: isPositive
        ? 'bg-emerald-100 dark:bg-emerald-900/20'
        : 'bg-rose-100 dark:bg-rose-900/20',
      title: isPositive ? t('Climbing the Ladder') : t('Slippery Slope'),
      description: `${mainText} ${comparisonText}`,
    });
  }

  // --- 3. RECENT FORM ---
  const sortedByDateDesc = [...validRanked].sort((a, b) => {
    const tA = parseFlexDate(a.tsIso ?? a.timestamp).getTime();
    const tB = parseFlexDate(b.tsIso ?? b.timestamp).getTime();
    return tB - tA;
  });

  const last10 = sortedByDateDesc.slice(0, 10);
  if (last10.length >= 5) {
    const winsInLast10 = last10.filter((m) => {
      const isP1 = m.player1Id === meUid;
      return isP1
        ? m.player1.scores > m.player2.scores
        : m.player2.scores > m.player1.scores;
    }).length;

    if (winsInLast10 >= 8) {
      rows.push({
        icon: Rocket,
        color: 'text-orange-600',
        bg: 'bg-orange-100 dark:bg-orange-900/20',
        title: t('Unstoppable Force'),
        description: t(
          'Won {{wins}} of the last {{total}} games. You are on fire!',
          {
            wins: bold(winsInLast10),
            total: bold(last10.length),
            interpolation: { escapeValue: false },
          }
        ),
      });
    } else if (winsInLast10 <= 2) {
      rows.push({
        icon: HeartCrack,
        color: 'text-slate-600',
        bg: 'bg-slate-100 dark:bg-slate-800',
        title: t('Cold Spell'),
        description: t(
          'Only {{wins}} wins in the last {{total}} games. Time to focus!',
          {
            wins: bold(winsInLast10),
            total: bold(last10.length),
            interpolation: { escapeValue: false },
          }
        ),
      });
    }
  }

  // --- 4. CLUTCH FACTOR ---
  let closeGames = 0;
  let closeWins = 0;
  let stomps = 0;

  validRanked.forEach((m) => {
    const isP1 = m.player1Id === meUid;
    const myScore = Number(isP1 ? m.player1.scores : m.player2.scores);
    const oppScore = Number(isP1 ? m.player2.scores : m.player1.scores);
    const diff = Math.abs(myScore - oppScore);
    const win = myScore > oppScore;

    if (diff <= 2) {
      closeGames++;
      if (win) closeWins++;
    }
    if (diff >= 7 && win) {
      stomps++;
    }
  });

  if (closeGames >= 5) {
    const clutchRate = closeWins / closeGames;
    if (clutchRate >= 0.65) {
      rows.push({
        icon: Crosshair,
        color: 'text-emerald-600',
        bg: 'bg-emerald-100 dark:bg-emerald-900/20',
        title: t('Ice in Veins'),
        description: t(
          'You win {{pct}} of close matches (diff ≤ 2). Nerves of steel!',
          {
            pct: bold(pct(clutchRate * 100)),
            interpolation: { escapeValue: false },
          }
        ),
      });
    }
  }

  if (stats.total > 10 && stomps / stats.total >= 0.2) {
    rows.push({
      icon: Skull,
      color: 'text-indigo-600',
      bg: 'bg-indigo-100 dark:bg-indigo-900/20',
      title: t('The Punisher'),
      description: t(
        '{{pct}} of your wins are absolute stomps (7+ point diff).',
        {
          pct: bold(pct((stomps / stats.total) * 100)),
          interpolation: { escapeValue: false },
        }
      ),
    });
  }

  // --- 5. SIDE SPECIALIST ---
  const lGames = sideStats.leftSideWins + sideStats.leftSideLosses;
  const rGames = sideStats.rightSideWins + sideStats.rightSideLosses;

  if (lGames >= 5 && rGames >= 5) {
    const winL = lGames ? sideStats.leftSideWins / lGames : 0;
    const winR = rGames ? sideStats.rightSideWins / rGames : 0;
    const diff = Math.abs(winL - winR);

    if (diff > 0.15) {
      const betterSide = winL > winR ? 'Left' : 'Right';
      const betterRate = winL > winR ? winL : winR;
      rows.push({
        icon: ArrowLeftRight,
        color: 'text-cyan-600',
        bg: 'bg-cyan-100 dark:bg-cyan-900/20',
        title: t('Side Specialist'),
        description: t(
          'You are deadly on the {{side}} side with a {{rate}} win rate.',
          {
            side: t(betterSide),
            rate: bold(pct(betterRate * 100)),
            interpolation: { escapeValue: false },
          }
        ),
      });
    }
  }

  // --- 6. RECORD STREAK ---
  if (stats.maxWinStreak >= 5) {
    rows.push({
      icon: Flame,
      color: 'text-orange-500',
      bg: 'bg-orange-100 dark:bg-orange-900/20',
      title: t('Hot Streak History'),
      description: t('Your record is {{streak}} wins in a row.', {
        streak: bold(stats.maxWinStreak),
        interpolation: { escapeValue: false },
      }),
    });
  }

  return rows.slice(0, 4);
}
