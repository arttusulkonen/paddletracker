"use client";
import { Tooltip as RechartTooltip } from 'recharts';

import AchievementsPanel from "@/components/AchievementsPanel";
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
} from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import * as Friends from "@/lib/friends";
import type { Match, UserProfile } from "@/lib/types";
import { format, parse } from "date-fns";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import {
  Activity,
  CornerUpLeft,
  CornerUpRight,
  Flame,
  LineChart as LineChartIcon,
  ListOrdered,
  Medal,
  Percent,
  PieChart as PieChartIcon,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Brush,
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

const parseDate = (d: string | Timestamp) =>
  typeof d === "string"
    ? parse(d, "dd.MM.yyyy HH.mm.ss", new Date())
    : d.toDate();

const getRank = (elo: number) =>
  elo < 1001
    ? "Ping-Pong Padawan"
    : elo < 1100
      ? "Table-Tennis Trainee"
      : elo < 1200
        ? "Racket Rookie"
        : elo < 1400
          ? "Paddle Prodigy"
          : elo < 1800
            ? "Spin Sensei"
            : elo < 2000
              ? "Smash Samurai"
              : "Ping-Pong Paladin";

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
  const res = {
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
    const win = me.scores > opp.scores;
    if (me.side === "left") {
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
}

export default function ProfileUidPage() {
  const { uid: targetUid } = useParams<{ uid: string }>();
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const isSelf = targetUid === user?.uid;

  const [targetProfile, setTargetProfile] = useState<UserProfile | null>(
    null
  );
  const [matches, setMatches] = useState<Match[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [oppFilter, setOppFilter] = useState("all");
  const [friendStatus, setFriendStatus] = useState<
    "friends" | "out" | "in" | "none"
  >("none");

  useEffect(() => {
    if (!user || !targetProfile) return;
    if (targetProfile.friends?.includes(user.uid)) setFriendStatus("friends");
    else if (targetProfile.outgoingRequests?.includes(user.uid))
      setFriendStatus("in");
    else if (targetProfile.incomingRequests?.includes(user.uid))
      setFriendStatus("out");
    else setFriendStatus("none");
  }, [user, targetProfile]);

  // load profile
  useEffect(() => {
    const load = async () => {
      if (!targetUid) return;
      if (isSelf && userProfile) {
        setTargetProfile(userProfile);
        return;
      }
      const snap = await getDoc(doc(db, "users", targetUid));
      if (!snap.exists()) {
        router.push("/profile");
        return;
      }
      setTargetProfile({ uid: targetUid, ...(snap.data() as any) });
    };
    load();
  }, [targetUid, isSelf, userProfile, router]);

  // load matches
  const loadMatches = useCallback(async () => {
    if (!targetUid) return;
    setLoadingMatches(true);
    const ref = collection(db, "matches");
    const [p1, p2] = await Promise.all([
      getDocs(query(ref, where("player1Id", "==", targetUid))),
      getDocs(query(ref, where("player2Id", "==", targetUid))),
    ]);
    const raw: Match[] = [];
    p1.forEach((d) => raw.push({ id: d.id, ...(d.data() as any) }));
    p2.forEach((d) => raw.push({ id: d.id, ...(d.data() as any) }));
    const uniq = Array.from(new Map(raw.map((r) => [r.id, r])).values()).sort(
      (a, b) =>
        parseDate(b.timestamp ?? b.playedAt).getTime() -
        parseDate(a.timestamp ?? a.playedAt).getTime()
    );
    setMatches(uniq);
    setLoadingMatches(false);
  }, [targetUid]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  const opponents = useMemo(() => {
    const m = new Map<string, string>();
    matches.forEach((x) => {
      const p1 = x.player1Id === targetUid;
      m.set(p1 ? x.player2Id : x.player1Id, p1 ? x.player2.name : x.player1.name);
    });
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [matches, targetUid]);

  const filtered = useMemo(
    () =>
      oppFilter === "all"
        ? matches
        : matches.filter(
          (m) => m.player1Id === oppFilter || m.player2Id === oppFilter
        ),
    [matches, oppFilter]
  );

  const stats = useMemo(() => computeStats(filtered, targetUid), [
    filtered,
    targetUid,
  ]);
  const sideStats = useMemo(() => computeSideStats(filtered, targetUid), [
    filtered,
    targetUid,
  ]);

  const displayName =
    targetProfile?.displayName ?? targetProfile?.name ?? "Unknown Player";

  const perfData = filtered.length
    ? filtered
      .slice()
      .sort(
        (a, b) =>
          parseDate(a.timestamp ?? a.playedAt).getTime() -
          parseDate(b.timestamp ?? b.playedAt).getTime()
      )
      .map((m) => {
        const p1 = m.player1Id === targetUid;
        const win = p1
          ? m.player1.scores > m.player2.scores
          : m.player2.scores > m.player1.scores;
        return {
          label: format(parseDate(m.timestamp ?? m.playedAt), "dd.MM.yy"),
          result: win ? 1 : -1,
          diff: p1
            ? m.player1.scores - m.player2.scores
            : m.player2.scores - m.player1.scores,
          rating: p1 ? m.player1.newRating : m.player2.newRating,
        };
      })
    : [{ label: "", result: 0, diff: 0, rating: targetProfile?.rating ?? 0 }];

  const pieData = [
    { name: "Wins", value: stats.wins, fill: "hsl(var(--accent))" },
    { name: "Losses", value: stats.losses, fill: "hsl(var(--destructive))" },
  ];

  if (!targetProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-16 w-16 rounded-full border-b-4 border-primary" />
      </div>
    );
  }

  return (
    <section className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <Card>
        <CardHeader className="flex flex-col md:flex-row items-center gap-6">
          <Avatar className="h-24 w-24">
            <AvatarImage src={targetProfile.photoURL || undefined} />
            <AvatarFallback className="text-4xl">
              {displayName.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="space-y-1 text-center md:text-left">
            <div className="flex items-center gap-4">
              <CardTitle className="text-4xl">{displayName}</CardTitle>
              {!isSelf && user && (
                <Button
                  size="sm"
                  variant={friendStatus === "friends" ? "secondary" : "outline"}
                  onClick={async () => {
                    switch (friendStatus) {
                      case "none":
                        await Friends.sendFriendRequest(user.uid, targetUid);
                        break;
                      case "out":
                        await Friends.cancelRequest(user.uid, targetUid);
                        break;
                      case "in":
                        await Friends.acceptRequest(user.uid, targetUid);
                        break;
                      case "friends":
                        await Friends.unfriend(user.uid, targetUid);
                        break;
                    }
                  }}
                >
                  {{
                    none: "Add Friend",
                    out: "Cancel Request",
                    in: "Accept Request",
                    friends: "Unfriend",
                  }[friendStatus]}
                </Button>
              )}
            </div>
            <CardDescription>{targetProfile.email}</CardDescription>
            <span className="inline-flex items-center gap-2 rounded-md bg-muted py-1 px-2 text-sm">
              <Medal className="h-4 w-4 text-accent" />{" "}
              {getRank(targetProfile.rating)}
            </span>
          </div>
        </CardHeader>
      </Card>

      {/* Small stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          icon={LineChartIcon}
          label="Current ELO"
          value={targetProfile.rating}
        />
        <StatCard icon={ListOrdered} label="Matches" value={stats.total} />
        <StatCard
          icon={Percent}
          label="Win Rate"
          value={`${stats.winRate.toFixed(1)}%`}
        />
        <StatCard icon={Flame} label="Max Streak" value={stats.maxWinStreak} />
      </div>

      {/* Achievements */}
      <AchievementsPanel
        achievements={targetProfile.achievements ?? []}
        overallMatches={stats.total}
        overallWins={stats.wins}
        overallMaxStreak={stats.maxWinStreak}
      />

      {/* Friends */}
      {targetProfile.friends?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Friends</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            {targetProfile.friends.map((fid) => (
              <FriendChip key={fid} uid={fid} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Opponent filter */}
      <div className="flex items-center gap-4">
        <span className="font-medium">Filter by Opponent:</span>
        <Select value={oppFilter} onValueChange={setOppFilter}>
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

      <div className="space-y-8">
        <ChartCard title="ELO History" icon={LineChartIcon}>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={perfData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis domain={['dataMin-20', 'dataMax+20']} />
              <RechartTooltip
                contentStyle={{ backgroundColor: '#fff', borderRadius: 4 }}
                formatter={(value, name, { payload }) => [`${name}: ${value}`, `Date: ${payload.label}`]}
              />
              <ReLegend />
              <Line type="monotone" dataKey="rating" dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Brush dataKey="label" height={20} travellerWidth={10} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <PieCard title="Win / Loss" icon={PieChartIcon} data={pieData} />

        <ChartCard title="Match Result" icon={Activity}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={perfData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis domain={[-1.2, 1.2]} ticks={[-1, 0, 1]} />
              <RechartTooltip
                contentStyle={{ backgroundColor: '#fff', borderRadius: 4 }}
                formatter={(value, name, { payload }) => [
                  `${name}: ${value > 0 ? 'Win' : 'Loss'}`,
                  `Date: ${payload.label}`,
                ]}
              />
              <ReLegend />
              <Line type="stepAfter" dataKey="result" dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Brush dataKey="label" height={20} travellerWidth={10} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Score Difference" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={perfData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis />
              <RechartTooltip
                contentStyle={{ backgroundColor: '#fff', borderRadius: 4 }}
                formatter={(value, name, { payload }) => [
                  `${name}: ${value}`,
                  `Date: ${payload.label}`,
                ]}
              />
              <ReLegend />
              <Line type="monotone" dataKey="diff" dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Brush dataKey="label" height={20} travellerWidth={10} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Detailed stats */}
      <DetailedStatsCard stats={stats} side={sideStats} />

      {/* Matches table */}
      <MatchesTableCard
        title={`All Matches (${filtered.length})`}
        matches={filtered}
        loading={loadingMatches}
        meUid={targetUid}
      />
    </section>
  );
}

/* ---------------- small reusable ---------------- */
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
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-80 w-full">{children}</CardContent>
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
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
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
}: {
  stats: ReturnType<typeof computeStats>;
  side: ReturnType<typeof computeSideStats>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CornerUpLeft /> / <CornerUpRight /> Detailed Statistics
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
        <StatItem l="Matches" v={stats.total} />
        <StatItem l="Wins / Losses" v={`${stats.wins} / ${stats.losses}`} />
        <StatItem l="Win Rate" v={`${stats.winRate.toFixed(2)}%`} />
        <StatItem l="Best Win Margin" v={stats.bestWinMargin} />
        <StatItem l="Worst Loss Margin" v={stats.worstLossMargin} />
        <StatItem l="Points Scored" v={stats.pointsScored} />
        <StatItem l="Points Conceded" v={stats.pointsConceded} />
        <StatItem l="Point Diff" v={stats.pointsDiff} />
        <StatItem l="Max Win Streak" v={stats.maxWinStreak} />
        <StatItem l="Max Loss Streak" v={stats.maxLossStreak} />
        <StatItem l="Left Side W/L" v={`${side.leftWins} / ${side.leftLosses}`} />
        <StatItem l="Right Side W/L" v={`${side.rightWins} / ${side.rightLosses}`} />
      </CardContent>
    </Card>
  );
}
function StatItem({ l, v }: { l: string; v: React.ReactNode }) {
  return (
    <div>
      <p className="font-semibold">{l}</p>
      {v}
    </div>
  );
}

function MatchesTableCard({
  title,
  matches,
  loading,
  meUid,
}: {
  title: string;
  matches: Match[];
  loading: boolean;
  meUid: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8">Loading…</div>
        ) : matches.length === 0 ? (
          <p className="text-center py-8">No matches found.</p>
        ) : (
          <ScrollArea className="max-h-[28rem]">
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
                {matches.map((m) => {
                  const isP1 = m.player1Id === meUid;
                  const date =
                    typeof m.timestamp === "string"
                      ? m.timestamp
                      : format(m.playedAt.toDate(), "dd.MM.yyyy HH:mm");
                  const opp = isP1 ? m.player2.name : m.player1.name;
                  const myScore = isP1 ? m.player1.scores : m.player2.scores;
                  const theirScore = isP1 ? m.player2.scores : m.player1.scores;
                  const eloΔ = isP1 ? m.player1.addedPoints : m.player2.addedPoints;
                  const win = myScore > theirScore;
                  return (
                    <TableRow key={m.id}>
                      <TableCell>{date}</TableCell>
                      <TableCell>{opp}</TableCell>
                      <TableCell>
                        {myScore} – {theirScore}
                      </TableCell>
                      <TableCell
                        className={win ? "text-accent" : "text-destructive"}
                      >
                        {win ? "Win" : "Loss"}
                      </TableCell>
                      <TableCell
                        className={eloΔ >= 0 ? "text-accent" : "text-destructive"}
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
  const [info, setInfo] = useState<{
    name?: string;
    photoURL?: string;
  } | null>(null);

  useEffect(() => {
    Friends.getUserLite(uid).then(setInfo);
  }, [uid]);

  if (!info?.name) return null;
  return (
    <Link
      href={`/profile/${uid}`}
      className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-muted hover:bg-muted/70"
    >
      <Avatar className="h-6 w-6">
        {info.photoURL ? (
          <AvatarImage src={info.photoURL} />
        ) : (
          <AvatarFallback>{info.name.charAt(0)}</AvatarFallback>
        )}
      </Avatar>
      <span className="text-sm">{info.name}</span>
    </Link>
  );
}