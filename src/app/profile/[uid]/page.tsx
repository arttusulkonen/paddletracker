// src/app/profile/[uid]/page.tsx
"use client";

import AchievementsPanel from "@/components/AchievementsPanel";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardContent,
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
import { useToast } from "@/hooks/use-toast";
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
  Percent,
  PieChart as PieChartIcon,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FC, useCallback, useEffect, useMemo, useState } from "react";
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
} from "recharts";

// ---------------- Utility ----------------

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

const medalMap: Record<string, string> = {
  "Ping-Pong Padawan": "/img/ping-pong-padawan.png",
  "Table-Tennis Trainee": "/img/table-tennis-trainee.png",
  "Racket Rookie": "/img/racket-rookie.png",
  "Paddle Prodigy": "/img/paddle-prodigy.png",
  "Spin Sensei": "/img/spin-sensei.png",
  "Smash Samurai": "/img/smash-samurai.png",
  "Ping-Pong Paladin": "/img/ping-pong-paladin.png",
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
  let leftWins = 0,
    leftLosses = 0,
    rightWins = 0,
    rightLosses = 0,
    leftScored = 0,
    leftConceded = 0,
    rightScored = 0,
    rightConceded = 0;

  list.forEach((m) => {
    const p1 = m.player1Id === uid;
    const me = p1 ? m.player1 : m.player2;
    const opp = p1 ? m.player2 : m.player1;
    const win = me.scores > opp.scores;
    if (me.side === "left") {
      win ? leftWins++ : leftLosses++;
      leftScored += me.scores;
      leftConceded += opp.scores;
    } else {
      win ? rightWins++ : rightLosses++;
      rightScored += me.scores;
      rightConceded += opp.scores;
    }
  });

  return {
    leftWins,
    leftLosses,
    rightWins,
    rightLosses,
    leftScored,
    leftConceded,
    rightScored,
    rightConceded,
  };
}

// ---------------- Custom Tooltip ----------------

const CustomTooltip: FC<RechartTooltip["props"]> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-white p-2 rounded shadow-lg text-sm">
      <div className="font-semibold mb-1">{label}</div>
      <div>Opponent: {data.opponent}</div>
      <div>Score: {data.score}</div>
      <div>
        Δ Points: {data.addedPoints > 0 ? `+${data.addedPoints}` : data.addedPoints}
      </div>
      <div>Your ELO: {data.rating}</div>
    </div>
  );
};

// ---------------- Profile Page ----------------

export default function ProfileUidPage() {
  const { uid: targetUid } = useParams<{ uid: string }>();
  const router = useRouter();
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const isSelf = targetUid === user?.uid;

  const [targetProfile, setTargetProfile] = useState<UserProfile | null>(null);
  const [friendStatus, setFriendStatus] = useState<
    "none" | "outgoing" | "incoming" | "friends"
  >("none");
  const [matches, setMatches] = useState<Match[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [oppFilter, setOppFilter] = useState("all");

  // Load target's profile & derive friendStatus
  useEffect(() => {
    if (!targetUid) return;
    if (isSelf && userProfile) {
      setTargetProfile(userProfile);
      setFriendStatus("none");
      return;
    }

    getDoc(doc(db, "users", targetUid)).then((snap) => {
      if (!snap.exists()) {
        router.push("/profile");
      } else {
        const data = snap.data() as any;
        setTargetProfile({ uid: targetUid, ...data });

        const incoming: string[] = data.incomingRequests ?? [];
        const outgoing: string[] = data.outgoingRequests ?? [];
        const friendsArr: string[] = data.friends ?? [];

        if (friendsArr.includes(user!.uid)) {
          setFriendStatus("friends");
        } else if (incoming.includes(user!.uid)) {
          // they sent you a request
          setFriendStatus("incoming");
        } else if (outgoing.includes(user!.uid)) {
          // you sent them a request
          setFriendStatus("outgoing");
        } else {
          setFriendStatus("none");
        }
      }
    });
  }, [targetUid, isSelf, user, userProfile, router]);

  // Load matches
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
      (a, b) => parseDate(b.timestamp).getTime() - parseDate(a.timestamp).getTime()
    );
    setMatches(uniq);
    setLoadingMatches(false);
  }, [targetUid]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  // Opponents list
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

  // Filtered matches
  const filtered = useMemo(
    () =>
      oppFilter === "all"
        ? matches
        : matches.filter(
          (m) => m.player1Id === oppFilter || m.player2Id === oppFilter
        ),
    [matches, oppFilter]
  );

  // Stats
  const stats = useMemo(() => computeStats(filtered, targetUid), [
    filtered,
    targetUid,
  ]);
  const sideStats = useMemo(() => computeSideStats(filtered, targetUid), [
    filtered,
    targetUid,
  ]);

  // Performance data
  const perfData = filtered.length
    ? filtered
      .slice()
      .sort(
        (a, b) => parseDate(a.timestamp).getTime() - parseDate(b.timestamp).getTime()
      )
      .map((m) => {
        const isP1 = m.player1Id === targetUid;
        const me = isP1 ? m.player1 : m.player2;
        const opp = isP1 ? m.player2 : m.player1;
        return {
          label: format(parseDate(m.timestamp), "dd.MM.yy"),
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
        label: "",
        rating: targetProfile?.rating ?? 0,
        diff: 0,
        result: 0,
        opponent: "",
        score: "",
        addedPoints: 0,
      },
    ];

  // Pie data
  const pieData = [
    { name: "Wins", value: stats.wins, fill: "hsl(var(--accent))" },
    { name: "Losses", value: stats.losses, fill: "hsl(var(--destructive))" },
  ];
  const sidePieData = [
    { name: "Left Wins", value: sideStats.leftWins, fill: "hsl(var(--accent))" },
    { name: "Right Wins", value: sideStats.rightWins, fill: "hsl(var(--primary))" },
  ];

  if (!targetProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-16 w-16 rounded-full border-b-4 border-primary" />
      </div>
    );
  }

  const displayName =
    targetProfile.displayName ?? targetProfile.name ?? "Unknown Player";
  const rank = getRank(targetProfile.maxRating);
  const medalSrc = medalMap[rank];

  // Friend button handlers
  const handleAdd = async () => {
    await Friends.sendFriendRequest(user!.uid, targetUid);
    setFriendStatus("outgoing");
    toast({ title: "Request sent" });
  };
  const handleCancel = async () => {
    await Friends.cancelRequest(user!.uid, targetUid);
    setFriendStatus("none");
    toast({ title: "Request canceled" });
  };
  const handleAccept = async () => {
    await Friends.acceptRequest(user!.uid, targetUid);
    setFriendStatus("friends");
    toast({ title: "Friend added" });
  };
  const handleRemove = async () => {
    await Friends.unfriend(user!.uid, targetUid);
    setFriendStatus("none");
    toast({ title: "Friend removed" });
  };

  return (
    <section className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <Card>
        <CardHeader className="flex flex-col md:flex-row md:justify-between items-center gap-6">
          <div className="flex items-center gap-6">
            <Avatar className="h-32 w-32">
              <AvatarImage
                src={targetProfile.photoURL || undefined}
                className="object-cover"
              />
              <AvatarFallback className="text-4xl">
                {displayName.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="text-left space-y-1">
              <CardTitle className="text-4xl">{displayName}</CardTitle>
              <div className="inline-flex items-center gap-2 rounded-md bg-muted py-1 px-2 text-sm">
                <span className="font-medium">{rank}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {medalSrc && (
              <img
                src={medalSrc}
                alt={rank}
                className="h-[140px] w-[140px] rounded-md"
              />
            )}
            {!isSelf && (
              <>
                {friendStatus === "none" && (
                  <Button onClick={handleAdd}>Add Friend</Button>
                )}
                {friendStatus === "outgoing" && (
                  <Button onClick={handleCancel}>Cancel Request</Button>
                )}
                {friendStatus === "incoming" && (
                  <Button onClick={handleAccept}>Accept Request</Button>
                )}
                {friendStatus === "friends" && (
                  <Button variant="destructive" onClick={handleRemove}>
                    Remove Friend
                  </Button>
                )}
              </>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Small stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          icon={LineChartIcon}
          label="Current ELO"
          value={targetProfile.globalElo}
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
        achievements={targetProfile.achievements || []}
        overallMatches={stats.total}
        overallWins={stats.wins}
        overallMaxStreak={stats.maxWinStreak}
      />

      {/* Friends (list) */}
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

      {/* Detailed stats */}
      <DetailedStatsCard stats={stats} side={sideStats} />

      {/* Charts */}
      <div className="space-y-8">
        {/* ELO History */}
        <ChartCard title="ELO History" icon={LineChartIcon}>
          <ResponsiveContainer width="100%" height={450}>
            <LineChart data={perfData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis domain={["dataMin-20", "dataMax+20"]} />
              <RechartTooltip content={<CustomTooltip />} />
              <ReLegend />
              <Line type="monotone" dataKey="rating" dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Brush dataKey="label" height={20} travellerWidth={10} startIndex={Math.floor(perfData.length * 0.8)} endIndex={perfData.length - 1} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Pie charts */}
        <div className="grid grid-cols-2 gap-4">
          <PieCard title="Win / Loss" icon={PieChartIcon} data={pieData} />
          <PieCard title="Side Wins" icon={PieChartIcon} data={sidePieData} />
        </div>

        {/* Match Result */}
        <ChartCard title="Match Result" icon={Activity}>
          <ResponsiveContainer width="100%" height={450}>
            <LineChart data={perfData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis domain={[-1.2, 1.2]} ticks={[-1, 0, 1]} />
              <RechartTooltip content={<CustomTooltip />} />
              <ReLegend />
              <Line type="stepAfter" dataKey="result" dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Brush dataKey="label" height={20} travellerWidth={10} startIndex={Math.floor(perfData.length * 0.8)} endIndex={perfData.length - 1} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Score Difference */}
        <ChartCard title="Score Difference" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={450}>
            <LineChart data={perfData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis />
              <RechartTooltip content={<CustomTooltip />} />
              <ReLegend />
              <Line type="monotone" dataKey="diff" dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Brush dataKey="label" height={20} travellerWidth={10} startIndex={Math.floor(perfData.length * 0.8)} endIndex={perfData.length - 1} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Matches Table */}
      <MatchesTableCard
        title={`All Matches (${filtered.length})`}
        matches={filtered}
        loading={loadingMatches}
        meUid={targetUid}
      />
    </section>
  );
}

// ————————————————
// (Below are your small reusable components unchanged)
// ————————————————

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
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

function ChartCard({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[500px] w-full">{children}</CardContent>
    </Card>
  );
}

function PieCard({ title, icon: Icon, data }: { title: string; icon: any; data: { name: string; value: number; fill: string }[] }) {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[350px] w-full">
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

function DetailedStatsCard({ stats, side }: { stats: ReturnType<typeof computeStats>; side: ReturnType<typeof computeSideStats> }) {
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

function MatchesTableCard({ title, matches, loading, meUid }: { title: string; matches: Match[]; loading: boolean; meUid: string }) {
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
          <ScrollArea className="h-[400px]">
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
                      <TableCell className={win ? "text-accent" : "text-destructive"}>
                        {win ? "Win" : "Loss"}
                      </TableCell>
                      <TableCell className={eloΔ >= 0 ? "text-accent" : "text-destructive"}>
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
  const [info, setInfo] = useState<{ name?: string; photoURL?: string } | null>(null);
  useEffect(() => {
    Friends.getUserLite(uid).then(setInfo);
  }, [uid]);

  if (!info?.name) return null;
  return (
    <Link href={`/profile/${uid}`} className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-muted hover:bg-muted/70">
      <Avatar className="h-6 w-6">
        {info.photoURL ? <AvatarImage src={info.photoURL} /> : <AvatarFallback>{info.name.charAt(0)}</AvatarFallback>}
      </Avatar>
      <span className="text-sm">{info.name}</span>
    </Link>
  );
}