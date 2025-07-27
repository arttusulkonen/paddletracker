// src/lib/utils/profileUtils.ts
import type { Match, UserProfile } from '@/lib/types'; // ✅ Добавлен UserProfile
import { ArrowLeftRight, Flame, TrendingDown, TrendingUp } from 'lucide-react';
import { parseFlexDate } from './date';

// ... (остальные функции getRank, medalMap, computeStats без изменений) ...

export const getRank = (elo: number, t: (key: string) => string) =>
  elo < 1001 ? t('Ping-Pong Padawan') : elo < 1100 ? t('Table-Tennis Trainee') : elo < 1200 ? t('Racket Rookie') : elo < 1400 ? t('Paddle Prodigy') : elo < 1800 ? t('Spin Sensei') : elo < 2000 ? t('Smash Samurai') : t('Ping-Pong Paladin');

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
  let wins = 0, losses = 0, best = -Infinity, worst = Infinity, scored = 0, conceded = 0, curW = 0, curL = 0, maxW = 0, maxL = 0;
  list.forEach((m) => {
    const p1 = m.player1Id === uid;
    const me = p1 ? m.player1 : m.player2;
    const opp = p1 ? m.player2 : m.player1;
    const win = me.scores > opp.scores;
    scored += me.scores; conceded += opp.scores;
    if (win) { wins++; curW++; curL = 0; maxW = Math.max(maxW, curW); best = Math.max(best, me.scores - opp.scores); }
    else { losses++; curL++; curW = 0; maxL = Math.max(maxL, curL); worst = Math.min(worst, me.scores - opp.scores); }
  });
  const total = wins + losses;
  return { total, wins, losses, winRate: total ? (wins / total) * 100 : 0, bestWinMargin: isFinite(best) ? best : 0, worstLossMargin: isFinite(worst) ? Math.abs(worst) : 0, pointsScored: scored, pointsConceded: conceded, pointsDiff: scored - conceded, maxWinStreak: maxW, maxLossStreak: maxL };
}

// ✅ НОВАЯ ФУНКЦИЯ для теннисной статистики
export function computeTennisStats(list: Match[], uid: string, profile: UserProfile | null, sport: 'tennis') {
  let aces = 0, doubleFaults = 0, winners = 0;

  // Суммируем статистику из каждого матча
  list.forEach(m => {
    const isP1 = m.player1Id === uid;
    const me = isP1 ? m.player1 : m.player2;
    aces += Number(me.aces1 ?? me.aces2 ?? 0); // Данные могут быть в разных полях
    doubleFaults += Number(me.doubleFaults1 ?? me.doubleFaults2 ?? 0);
    winners += Number(me.winners1 ?? me.winners2 ?? 0);
  });

  // Также можно взять общие данные из профиля, если они там хранятся
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
    if (me.side === 'left') {
      win ? leftSideWins++ : leftSideLosses++;
    } else if (me.side === 'right') {
      win ? rightSideWins++ : rightSideLosses++;
    }
  });
  return { leftSideWins, leftSideLosses, rightSideWins, rightSideLosses };
}

// ... (остальные функции groupByMonth, opponentStats, buildInsights без изменений) ...
export function groupByMonth(list: Match[], uid: string) {
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

const pct = (v: number) => `${v.toFixed(1)} %`;
export function buildInsights(stats: ReturnType<typeof computeStats>, side: ReturnType<typeof computeSideStats>, monthly: ReturnType<typeof groupByMonth>, t: (key: string) => string): any[] {
  const rows: any[] = [];
  const last = monthly.at(-1);
  if (last) {
    const up = last.delta >= 0;
    rows.push({ icon: up ? TrendingUp : TrendingDown, color: up ? 'text-emerald-600' : 'text-rose-600', text: `${t(up ? 'Gained' : 'Lost')} <b>${Math.abs(last.delta)} ELO</b> ${t('over the last month')}` });
  }
  const lGames = side.leftSideWins + side.leftSideLosses;
  const rGames = side.rightSideWins + side.rightSideLosses;
  if (lGames >= 10 && rGames >= 10) {
    const winL = (side.leftSideWins / lGames) * 100;
    const winR = (side.rightSideWins / rGames) * 100;
    const better = t(winL > winR ? 'left' : 'right');
    rows.push({ icon: ArrowLeftRight, color: 'text-indigo-600', text: winL === winR ? `${t('Almost even on both sides')} (${pct(winL)} / ${pct(winR)})` : `${t('Stronger on the')} <b>${better}</b> ${t('side')} (${pct(Math.max(winL, winR))}% ${t('win-rate')})` });
  }
  if (stats.maxWinStreak >= 8) {
    rows.push({ icon: Flame, color: 'text-amber-600', text: `${t('Longest winning streak:')} <b>${stats.maxWinStreak}</b> ${t('games')}` });
  }
  return rows;
}