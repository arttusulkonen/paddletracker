"use client";

import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ScrollArea,
} from "@/components/ui";
import { db } from "@/lib/firebase";
import type { Match } from "@/lib/types";
import { collection, getDocs, query, where } from "firebase/firestore";
import {
  ArrowLeft,
  Award,
  BarChartBig,
  Calendar,
  CircleDollarSign,
  Flame,
  Info,
  Medal,
  PlayCircle,
  Users2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const ROOMS = [
  "iS2q1soBUATEmNSqLmIo",
  "pPlqKgPGtTHfZXZHFF02",
  "iPJrIgLRSv6eFy5dK9a4",
  "P7Mef8YjHCM8F3nEdxEH",
  "UAd6HUKoE7Y5fv1rYcuC",
];

type AggPlayer = {
  name: string;
  wins: number;
  losses: number;
  points: number;
  streak: number;
  maxStreak: number;
  rivals: Set<string>;
  clutchWins: number;
  clutchGames: number;
};

type Extra = {
  maxPoints: number;
  maxMargin: number;
  busiestDay: { date: string; matches: number };
  globalMaxStreak: { name: string; len: number };
  mostRivals: { name: string; count: number };
};

function aggregate(list: Match[]) {
  const byP: Record<string, AggPlayer> = {};
  const dateFreq: Record<string, number> = {};
  let games = 0,
    totalPts = 0,
    maxPts = 0,
    maxMargin = 0,
    globalStreak = { id: "", len: 0 };

  for (const m of list) {
    games++;
    const pts = m.player1.scores + m.player2.scores;
    totalPts += pts;
    if (pts > maxPts) maxPts = pts;
    const margin = Math.abs(m.player1.scores - m.player2.scores);
    if (margin > maxMargin) maxMargin = margin;

    const dayKey = (m.timestamp ?? "").split(" ")[0] ?? "unknown";
    dateFreq[dayKey] = (dateFreq[dayKey] ?? 0) + 1;

    const p1Win = m.player1.scores > m.player2.scores;
    const decide =
      Math.max(m.player1.scores, m.player2.scores) === 11 &&
      Math.min(m.player1.scores, m.player2.scores) >= 10;

    [
      { id: m.player1Id, opp: m.player2Id, name: m.player1.name, win: p1Win },
      { id: m.player2Id, opp: m.player1Id, name: m.player2.name, win: !p1Win },
    ].forEach(({ id, opp, name, win }) => {
      if (!byP[id])
        byP[id] = {
          name,
          wins: 0,
          losses: 0,
          points: 0,
          streak: 0,
          maxStreak: 0,
          rivals: new Set<string>(),
          clutchWins: 0,
          clutchGames: 0,
        };
      const rec = byP[id];
      win ? rec.wins++ : rec.losses++;
      rec.points += pts;
      rec.rivals.add(opp);

      if (win) {
        rec.streak++;
        if (rec.streak > rec.maxStreak) rec.maxStreak = rec.streak;
        if (rec.maxStreak > globalStreak.len) globalStreak = { id, len: rec.maxStreak };
      } else rec.streak = 0;

      if (decide) {
        rec.clutchGames++;
        if (win) rec.clutchWins++;
      }
    });
  }

  const players = Object.values(byP).sort(
    (a, b) => b.wins - a.wins || a.losses - b.losses
  );

  const [busiestDate, busiestMatches] =
    Object.entries(dateFreq).sort((a, b) => b[1] - a[1])[0] ?? ["—", 0];

  const mostRivals = players
    .map((p) => ({ name: p.name, count: p.rivals.size }))
    .sort((a, b) => b.count - a.count)[0] ?? { name: "—", count: 0 };

  return {
    games,
    totalPts,
    players,
    extra: {
      maxPoints: maxPts,
      maxMargin,
      busiestDay: { date: busiestDate, matches: busiestMatches },
      globalMaxStreak: {
        name: byP[globalStreak.id]?.name ?? "—",
        len: globalStreak.len,
      },
      mostRivals,
    } as Extra,
  };
}

export default function Wrap2025() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [agg, setAgg] = useState<ReturnType<typeof aggregate> | null>(null);

  useEffect(() => {
    (async () => {
      const q = query(collection(db, "matches"), where("roomId", "in", ROOMS));
      const snap = await getDocs(q);
      const rows: Match[] = [];
      snap.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
      setAgg(aggregate(rows));
      setLoading(false);
    })();
  }, []);

  const chartData = useMemo(() => {
    if (!agg) return [];
    return agg.players.map((p) => ({
      name: p.name,
      Wins: p.wins,
      Games: p.wins + p.losses,
    }));
  }, [agg]);

  if (loading || !agg) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-12 w-12 rounded-full border-b-4 border-primary" />
      </div>
    );
  }

  const avgPts = Math.round(agg.totalPts / agg.games || 0);

  return (
    <div className="container mx-auto py-8 px-4">
      <Button variant="outline" className="mb-6" onClick={() => router.push("/")}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>

      {/* Hero */}
      <Card className="mb-8 shadow-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white rounded-3xl">
        <CardHeader className="text-center py-12">
          <CardTitle className="text-4xl font-extrabold tracking-wide">🎉 Ping-Pong WRAP ’25</CardTitle>
          <CardDescription className="text-lg mt-2 text-white/80">
            A full-year look at the real-room action
          </CardDescription>
        </CardHeader>
      </Card>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
        <Stat icon={PlayCircle} label="Matches" value={agg.games} />
        <Stat icon={CircleDollarSign} label="Points" value={agg.totalPts} />
        <Stat icon={Users2} label="Players" value={agg.players.length} />
        <Stat icon={CircleDollarSign} label="Avg Pts" value={avgPts} />
      </div>

      {/* Fun extras */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <Stat icon={Medal} label="Most Points Match" value={agg.extra.maxPoints} />
        <Stat icon={Award} label="Highest Margin" value={agg.extra.maxMargin} />
        <Stat
          icon={Flame}
          label="Longest Streak"
          value={`${agg.extra.globalMaxStreak.name} (${agg.extra.globalMaxStreak.len})`}
        />
        <Stat
          icon={Calendar}
          label="Busiest Day"
          value={`${agg.extra.busiestDay.date} (${agg.extra.busiestDay.matches})`}
        />
        <Stat
          icon={CircleDollarSign}
          label="Pts / Win"
          value={Math.round(
            agg.totalPts / (agg.players.reduce((s, p) => s + p.wins, 0) || 1)
          )}
        />
        <Stat
          icon={BarChartBig}
          label="Most Rivals"
          value={`${agg.extra.mostRivals.name} (${agg.extra.mostRivals.count})`}
        />
      </div>

      {/* Leaderboard */}
      <Card className="shadow-md rounded-2xl mb-8">
        <CardHeader>
          <CardTitle>Win Leaderboard</CardTitle>
          <CardDescription>Every player · all time</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pr-2 text-left">#</th>
                  <th className="py-2 pr-2 text-left">Player</th>
                  <th className="py-2 pr-2 text-right">W / L</th>
                </tr>
              </thead>
              <tbody>
                {agg.players.map((p, i) => (
                  <tr key={p.name} className="border-b last:border-0">
                    <td className="py-1 pr-2">{i + 1}</td>
                    <td className="py-1 pr-2 flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarFallback>{p.name[0]}</AvatarFallback>
                      </Avatar>
                      {p.name}
                    </td>
                    <td className="py-1 pr-2 text-right">
                      {p.wins} / {p.losses}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      </Card>

    
      {/* Explanation block */}
      <Card className="shadow-sm rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" /> What do these numbers mean?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm leading-relaxed">
          <p><strong>Matches</strong> – total number of games recorded across the five real rooms.</p>
          <p><strong>Points</strong> – sum of both players’ scores in every match.</p>
          <p><strong>Avg Pts</strong> – average points per match (Points ÷ Matches).</p>
          <p><strong>Most Points Match</strong> – the single match with the highest combined score.</p>
          <p><strong>Highest Margin</strong> – the largest gap between winner and loser in any match.</p>
          <p><strong>Longest Streak</strong> – longest consecutive-win run achieved, with the player’s name.</p>
          <p><strong>Busiest Day</strong> – calendar date that hosted the most matches, together with the count.</p>
          <p><strong>Pts / Win</strong> – average points scored in matches that the winner actually won (a tempo proxy).</p>
          <p><strong>Most Rivals</strong> – player who faced the highest number of different opponents.</p>
          <p><strong>Win Leaderboard</strong> – players ranked by wins; ties resolved by fewer losses.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-muted p-4">
      <Icon className="h-6 w-6 text-primary mb-1" />
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-xs text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}