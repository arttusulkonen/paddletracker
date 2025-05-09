"use client";

import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import type { Match } from "@/lib/types";
import { format, parse } from "date-fns";
import {
  collection,
  getDocs,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  BarChart3,
  CornerUpLeft,
  CornerUpRight,
  Flame,
  LineChart as LineChartIcon,
  ListOrdered,
  Medal,
  Percent,
  PieChart as PieChartIcon,
} from "lucide-react";

import {
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  Legend as ReLegend,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import AchievementsPanel from "@/components/AchievementsPanel";

/* ------------------------------------------------------------------ */
/* helpers ----------------------------------------------------------- */
type SideStats = {
  leftWins: number;
  leftLosses: number;
  rightWins: number;
  rightLosses: number;
  leftScored: number;
  leftConceded: number;
  rightScored: number;
  rightConceded: number;
};

const dateObj = (d: string | Timestamp) =>
  typeof d === "string"
    ? parse(d, "dd.MM.yyyy HH.mm.ss", new Date())
    : d.toDate();

const rankFor = (elo: number) => {
  if (elo < 1001) return "Ping-Pong Padawan";
  if (elo < 1100) return "Table-Tennis Trainee";
  if (elo < 1200) return "Racket Rookie";
  if (elo < 1400) return "Paddle Prodigy";
  if (elo < 1800) return "Spin Sensei";
  if (elo < 2000) return "Smash Samurai";
  return "Ping-Pong Paladin";
};

const calcStats = (list: Match[], uid: string, myName: string | undefined) => {
  let wins = 0,
    losses = 0,
    bestWinMargin = -Infinity,
    worstLossMargin = Infinity,
    scored = 0,
    conceded = 0,
    curW = 0,
    curL = 0,
    maxW = 0,
    maxL = 0;

  list
    .slice()
    .reverse()
    .forEach((m) => {
      const p1 = m.player1Id === uid;
      const me = p1 ? m.player1 : m.player2;
      const opp = p1 ? m.player2 : m.player1;
      const win = m.winner === myName;

      scored += me.scores;
      conceded += opp.scores;

      if (win) {
        wins++;
        curW++;
        curL = 0;
        if (curW > maxW) maxW = curW;
        bestWinMargin = Math.max(bestWinMargin, me.scores - opp.scores);
      } else {
        losses++;
        curL++;
        curW = 0;
        if (curL > maxL) maxL = curL;
        worstLossMargin = Math.min(worstLossMargin, me.scores - opp.scores);
      }
    });

  const total = wins + losses;
  return {
    total,
    wins,
    losses,
    winRate: total ? (wins / total) * 100 : 0,
    bestWinMargin: isFinite(bestWinMargin) ? bestWinMargin : 0,
    worstLossMargin: isFinite(worstLossMargin) ? Math.abs(worstLossMargin) : 0,
    pointsScored: scored,
    pointsConceded: conceded,
    pointsDiff: scored - conceded,
    maxWinStreak: maxW,
    maxLossStreak: maxL,
  };
};

const calcSideStats = (list: Match[], uid: string) => {
  const res: SideStats = {
    leftWins: 0,
    leftLosses: 0,
    rightWins: 0,
    rightLosses: 0,
    leftScored: 0,
    leftConceded: 0,
    rightScored: 0,
    rightConceded: 0,
  };

  list.forEach((m) => {
    const p1 = m.player1Id === uid;
    const me = p1 ? m.player1 : m.player2;
    const opp = p1 ? m.player2 : m.player1;
    const win = m.winner === me.name;
    const side = me.side as "left" | "right";
    if (side === "left") {
      win ? res.leftWins++ : res.leftLosses++;
      res.leftScored += me.scores;
      res.leftConceded += opp.scores;
    } else {
      win ? res.rightWins++ : res.rightLosses++;
      res.rightScored += me.scores;
      res.rightConceded += opp.scores;
    }
  });

  return res;
};

/* ------------------------------------------------------------------ */
/* component --------------------------------------------------------- */
export default function ProfilePage() {
  const { user, userProfile, loading } = useAuth();

  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [opponent, setOpponent] = useState("all");

  /* --- fetch all my matches once ---------------------------------- */
  const loadMatches = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const ref = collection(db, "matches");
    const [p1, p2] = await Promise.all([
      getDocs(query(ref, where("player1Id", "==", user.uid))),
      getDocs(query(ref, where("player2Id", "==", user.uid))),
    ]);
    const raw: Match[] = [];
    p1.forEach((d) => raw.push({ id: d.id, ...(d.data() as any) }));
    p2.forEach((d) => raw.push({ id: d.id, ...(d.data() as any) }));

    const uniq = Array.from(new Map(raw.map((m) => [m.id, m])).values()).sort(
      (a, b) =>
        dateObj(b.timestamp ?? b.playedAt).getTime() -
        dateObj(a.timestamp ?? a.playedAt).getTime()
    );
    setMatches(uniq);
    setIsLoading(false);
  }, [user]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  /* --- opponents list --------------------------------------------- */
  const opponents = useMemo(() => {
    const m = new Map<string, string>();
    matches.forEach((match) => {
      const p1 = match.player1Id === user?.uid;
      const id = p1 ? match.player2Id : match.player1Id;
      const name = p1 ? match.player2.name : match.player1.name;
      m.set(id, name);
    });
    return [...m].map(([id, name]) => ({ id, name }));
  }, [matches, user]);

  /* --- matches filtered by current opponent ----------------------- */
  const filtered = useMemo(
    () =>
      opponent === "all"
        ? matches
        : matches.filter(
          (m) => m.player1Id === opponent || m.player2Id === opponent
        ),
    [matches, opponent]
  );

  /* --- stats based on filtered list ------------------------------- */
  const stats = useMemo(
    () =>
      user && userProfile ? calcStats(filtered, user.uid, userProfile.name) : null,
    [filtered, user, userProfile]
  );

  const sideStats = useMemo(
    () => (user ? calcSideStats(filtered, user.uid) : null),
    [filtered, user]
  );

  /* --- pie chart data --------------------------------------------- */
  const pieData = useMemo(
    () => [
      { name: "Wins", value: stats?.wins ?? 0, fill: "hsl(var(--accent))" },
      { name: "Losses", value: stats?.losses ?? 0, fill: "hsl(var(--destructive))" },
    ],
    [stats]
  );

  /* --- elo history (global, не зависит от фильтра) ---------------- */
  const eloHistory = useMemo(() => {
    const raw =
      userProfile?.eloHistory?.map((e) => ({
        ...e,
        dateObj: dateObj(e.date),
      })) ?? [];

    if (!raw.length)
      raw.push({ elo: userProfile?.globalElo ?? 0, dateObj: new Date() });

    return raw
      .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime())
      .map((e) => ({
        label: format(e.dateObj, "dd.MM HH:mm"),
        elo: e.elo,
      }));
  }, [userProfile]);

  /* --- ui guards --------------------------------------------------- */
  if (loading || !userProfile || !user) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-10rem)]">
        {loading ? (
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary" />
        ) : (
          <Button asChild>
            <a href="/login">Login</a>
          </Button>
        )}
      </div>
    );
  }

  const rank = rankFor(userProfile.globalElo);

  /* ---------------------------------------------------------------- */
  /* render ---------------------------------------------------------- */
  return (
    <section className="container mx-auto py-8 space-y-8">
      {/* header */}
      <Card>
        <CardHeader className="flex flex-col md:flex-row items-center gap-6">
          <Avatar className="h-24 w-24">
            <AvatarImage src={userProfile.photoURL || undefined} />
            <AvatarFallback className="text-4xl">{userProfile.name[0]}</AvatarFallback>
          </Avatar>
          <div className="text-center md:text-left space-y-1">
            <CardTitle className="text-4xl">{userProfile.name}</CardTitle>
            <CardDescription>{userProfile.email}</CardDescription>
            <span className="inline-flex items-center gap-2 rounded-md bg-muted py-1 px-2 text-sm">
              <Medal className="h-4 w-4 text-accent" /> {rank}
            </span>
          </div>
        </CardHeader>
      </Card>

      {/* quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard icon={LineChartIcon} label="Current ELO" value={userProfile.globalElo} />
        <StatCard icon={ListOrdered} label="Matches" value={stats?.total ?? 0} />
        <StatCard
          icon={Percent}
          label="Win Rate"
          value={`${stats ? stats.winRate.toFixed(1) : 0}%`}
        />
        <StatCard icon={Flame} label="Max Win Streak" value={stats?.maxWinStreak ?? 0} />
      </div>

      {/* achievements */}
      <AchievementsPanel
        achievements={userProfile.achievements}
        overallMatches={stats?.total ?? 0}
        overallWins={stats?.wins ?? 0}
        overallMaxStreak={stats?.maxWinStreak ?? 0}
      />

      {/* charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <ChartCard title="ELO History" icon={LineChartIcon}>
          <LineChartResponsive data={eloHistory} />
        </ChartCard>
        <PieCard title="Win / Loss" icon={PieChartIcon} data={pieData} />
      </div>

      {/* opponent filter */}
      <div className="flex items-center gap-4">
        <p className="font-medium">Filter by Opponent:</p>
        <Select value={opponent} onValueChange={setOpponent}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="All Opponents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Opponents</SelectItem>
            {opponents.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* detailed stats for filtered list */}
      {stats && (
        <DetailedStatsCard
          stats={stats}
          sideStats={sideStats}
          showLabel={opponent === "all" ? "Overall Statistics" : `Stats vs ${opponents.find(o => o.id === opponent)?.name}`}
        />
      )}

      {/* recent five */}
      <MatchesTableCard
        title="Recent Matches"
        icon={BarChart3}
        matches={filtered.slice(0, 5)}
        loading={isLoading}
      />

      {/* all */}
      <MatchesTableCard
        title={`All Matches (${filtered.length})`}
        matches={filtered}
        loading={isLoading}
        maxHeight="28rem"
      />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* small sub-components --------------------------------------------- */
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
      <CardContent className="flex items-center gap-4">
        <Icon className="h-6 w-6 text-primary" />
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold">{value}</p>
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
        <CardTitle className="flex items-center gap-2">
          <Icon /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-64">{children}</CardContent>
    </Card>
  );
}

function LineChartResponsive({ data }: { data: { label: string; elo: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis domain={["dataMin-20", "dataMax+20"]} />
        <ReLegend />
        <Line type="monotone" dataKey="elo" stroke="hsl(var(--primary))" dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
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
        <CardTitle className="flex items-center gap-2">
          <Icon /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label />
            <ReLegend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function DetailedStatsCard({
  stats,
  sideStats,
  showLabel,
}: {
  stats: ReturnType<typeof calcStats>;
  sideStats: SideStats | null;
  showLabel: string;
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Medal /> {showLabel}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          <Stat label="Matches Played" val={stats.total} />
          <Stat label="Wins / Losses" val={`${stats.wins} / ${stats.losses}`} />
          <Stat label="Best Win Margin" val={stats.bestWinMargin} />
          <Stat label="Worst Loss Margin" val={stats.worstLossMargin} />
          <Stat label="Points Scored" val={stats.pointsScored} />
          <Stat label="Points Conceded" val={stats.pointsConceded} />
          <Stat label="Point Diff" val={stats.pointsDiff} />
          <Stat label="Longest Win Streak" val={stats.maxWinStreak} />
          <Stat label="Longest Loss Streak" val={stats.maxLossStreak} />
        </CardContent>
      </Card>

      {sideStats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CornerUpLeft /> / <CornerUpRight /> Side Statistics
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
            <Side side="Left" wins={sideStats.leftWins} losses={sideStats.leftLosses} scored={sideStats.leftScored} conceded={sideStats.leftConceded} />
            <Side side="Right" wins={sideStats.rightWins} losses={sideStats.rightLosses} scored={sideStats.rightScored} conceded={sideStats.rightConceded} />
          </CardContent>
        </Card>
      )}
    </>
  );
}

const Stat = ({ label, val }: { label: string; val: React.ReactNode }) => (
  <div>
    <p className="font-semibold">{label}</p>
    {val}
  </div>
);

const Side = ({
  side,
  wins,
  losses,
  scored,
  conceded,
}: {
  side: string;
  wins: number;
  losses: number;
  scored: number;
  conceded: number;
}) => (
  <div>
    <p className="font-semibold mb-1">{side} Side</p>
    <p>Wins: {wins}</p>
    <p>Losses: {losses}</p>
    <p>
      Points: {scored} / {conceded}
    </p>
    <p>
      Win Ratio: {losses ? (wins / losses).toFixed(2) : wins}
    </p>
    <p>
      KD Ratio: {conceded ? (scored / conceded).toFixed(2) : scored}
    </p>
  </div>
);

function MatchesTableCard({
  title,
  icon: Icon,
  matches,
  loading,
  maxHeight = "16rem",
}: {
  title: string;
  icon?: any;
  matches: Match[];
  loading: boolean;
  maxHeight?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {Icon && <Icon />} {title}
        </CardTitle>
        {title === "Recent Matches" && <CardDescription>Last 5 matches</CardDescription>}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8">Loading…</div>
        ) : matches.length === 0 ? (
          <p className="text-center py-8">No matches found.</p>
        ) : (
          <ScrollArea className={`max-h-[${maxHeight}]`}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Opponent</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>ELO Δ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matches.map((m) => (
                  <MatchRow key={m.id} match={m} />
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function MatchRow({ match }: { match: Match }) {
  const { user, userProfile } = useAuth();
  if (!user || !userProfile) return null;
  const meP1 = match.player1Id === user.uid;
  const date = match.timestamp
    ? match.timestamp
    : format(match.playedAt.toDate(), "dd.MM.yyyy HH:mm");
  const opp = meP1 ? match.player2.name : match.player1.name;
  const myScore = meP1 ? match.player1.scores : match.player2.scores;
  const theirScore = meP1 ? match.player2.scores : match.player1.scores;
  const eloΔ = meP1 ? match.player1.addedPoints : match.player2.addedPoints;
  const win = match.winner === userProfile.name;
  return (
    <TableRow>
      <TableCell>{date}</TableCell>
      <TableCell>{opp}</TableCell>
      <TableCell>
        {myScore} – {theirScore}
      </TableCell>
      <TableCell className={win ? "text-accent" : "text-destructive"}>
        {win ? "Win" : "Loss"}
      </TableCell>
      <TableCell className={eloΔ >= 0 ? "text-accent" : "text-destructive"}>
        {eloΔ > 0 ? `+${eloΔ}` : eloΔ}
      </TableCell>
    </TableRow>
  );
}