
"use client";

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
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import * as Friends from "@/lib/friends";
import type { Match, UserProfile } from "@/lib/types";
import { parseFlexDate, safeFormatDate } from "@/lib/utils/date";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";

import {
  Activity,
  Camera,
  CornerUpLeft,
  CornerUpRight,
  Flame,
  LineChart as LineChartIcon,
  ListOrdered,
  Percent,
  PieChart as PieChartIcon,
  TrendingUp,
  UserPlus,
  UserX,
  UserCheck,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import React, { // Added React import for Fragment
  FC,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

// ---------------- Helpers ----------------

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

    if (me.side === "left") {
      if (win) leftSideWins++;
      else leftSideLosses++;
      leftPointsScored += me.scores;
      leftPointsConceded += opp.scores;
    } else if (me.side === "right") {
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

const CustomTooltip: FC<RechartTooltip["props"]> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-popover p-2 rounded shadow-lg text-xs border text-popover-foreground">
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

// ---------------- Main Page ----------------

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

  useEffect(() => {
    if (!targetUid || !user) return;

    // Viewing own profile – reuse auth context profile
    if (isSelf && userProfile) {
      setTargetProfile(userProfile);
      setFriendStatus("none"); // Not relevant for self
      return;
    }

    (async () => {
      const snap = await getDoc(doc(db, "users", targetUid));
      if (!snap.exists()) {
        toast({title: "Profile not found", variant: "destructive"});
        router.push("/"); // or a 404 page
        return;
      }
      setTargetProfile({ uid: targetUid, ...(snap.data() as any) });

      const mySnap = await getDoc(doc(db, "users", user.uid));
      const myData = mySnap.exists() ? (mySnap.data() as UserProfile) : null;
      if (!myData) return;

      const incoming: string[] = myData.incomingRequests ?? [];
      const outgoing: string[] = myData.outgoingRequests ?? [];
      const friendsArr: string[] = myData.friends ?? [];

      if (friendsArr.includes(targetUid)) setFriendStatus("friends");
      else if (outgoing.includes(targetUid)) setFriendStatus("outgoing");
      else if (incoming.includes(targetUid)) setFriendStatus("incoming");
      else setFriendStatus("none");
    })();
  }, [targetUid, isSelf, user, userProfile, router, toast]);

  // ---------------- Matches ----------------

  const [matches, setMatches] = useState<Match[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [oppFilter, setOppFilter] = useState("all");

  const loadMatches = useCallback(async () => {
    if (!targetUid) return;
    setLoadingMatches(true);
    const ref = collection(db, "matches");
    const [p1, p2] = await Promise.all([
      getDocs(query(ref, where("player1Id", "==", targetUid))),
      getDocs(query(ref, where("player2Id", "==", targetUid))),
    ]);
    const rows: Match[] = [];
    p1.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
    p2.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
    const uniq = Array.from(new Map(rows.map((r) => [r.id, r])).values()).sort(
      (a, b) =>
        parseFlexDate(b.timestamp ?? b.playedAt).getTime() -
        parseFlexDate(a.timestamp ?? a.playedAt).getTime()
    );
    setMatches(uniq);
    setLoadingMatches(false);
  }, [targetUid]);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  // ---------------- Memoised Derived Data ----------------

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
      oppFilter === "all"
        ? matches
        : matches.filter(
          (m) => m.player1Id === oppFilter || m.player2Id === oppFilter
        ),
    [matches, oppFilter]
  );

  const stats = useMemo(() => computeStats(filtered, targetUid), [filtered, targetUid]);
  const sideStats = useMemo(() => computeSideStats(filtered, targetUid), [filtered, targetUid]);

  const perfData = filtered.length
    ? filtered
      .slice()
      .sort(
        (a, b) =>
          parseFlexDate(a.timestamp ?? a.playedAt).getTime() -
          parseFlexDate(b.timestamp ?? b.playedAt).getTime()
      )
      .map((m) => {
        const isP1 = m.player1Id === targetUid;
        const me = isP1 ? m.player1 : m.player2;
        const opp = isP1 ? m.player2 : m.player1;
        return {
          label: safeFormatDate(m.timestamp ?? m.playedAt, "dd.MM"),
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

  const pieData = [
    { name: "Wins", value: stats.wins, fill: "hsl(var(--accent))" },
    { name: "Losses", value: stats.losses, fill: "hsl(var(--destructive))" },
  ];

  const sidePieData = [
    { name: "Left Wins", value: sideStats.leftSideWins, fill: "hsl(var(--accent))" },
    { name: "Right Wins", value: sideStats.rightSideWins, fill: "hsl(var(--primary))" },
  ];

  const sidePieLossData = [
    { name: 'Left Losses', value: sideStats.leftSideLosses, fill: 'hsl(var(--destructive))' },
    { name: 'Right Losses', value: sideStats.rightSideLosses, fill: 'hsl(var(--primary))' },
  ];

  if (!targetProfile) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-10rem)]">
        <div className="animate-spin h-12 w-12 sm:h-16 sm:w-16 rounded-full border-b-4 border-primary" />
      </div>
    );
  }

  const displayName =
    targetProfile.displayName ?? targetProfile.name ?? "Unknown Player";
  const rank = getRank(targetProfile.maxRating);
  const medalSrc = medalMap[rank];


  // ---------------- Friend Handlers ----------------

  const handleAdd = async () => {
    if (!user) return;
    await Friends.sendFriendRequest(user.uid, targetUid);
    setFriendStatus("outgoing");
    toast({ title: "Request sent" });
  };
  const handleCancel = async () => {
     if (!user) return;
    await Friends.cancelRequest(user.uid, targetUid);
    setFriendStatus("none");
    toast({ title: "Request canceled" });
  };
  const handleAccept = async () => {
     if (!user) return;
    await Friends.acceptRequest(user.uid, targetUid);
    setFriendStatus("friends");
    toast({ title: "Friend added" });
  };
  const handleReject = async () => {
    if(!user) return;
    await Friends.rejectRequest(user.uid, targetUid);
    setFriendStatus("none");
    toast({ title: "Request rejected" });
  }
  const handleRemove = async () => {
     if (!user) return;
    await Friends.unfriend(user.uid, targetUid);
    setFriendStatus("none");
    toast({ title: "Friend removed" });
  };

  return (
    <section className="container mx-auto py-4 sm:py-8 space-y-6 sm:space-y-8">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:justify-between items-center gap-4 sm:gap-6 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 text-center sm:text-left">
            <Avatar className="h-24 w-24 sm:h-32 sm:w-32">
              <AvatarImage src={targetProfile.photoURL || undefined} alt={displayName} />
              <AvatarFallback className="text-3xl sm:text-4xl">
                {displayName.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <CardTitle className="text-2xl sm:text-3xl md:text-4xl">{displayName}</CardTitle>
              {isSelf && (
                <CardDescription className="text-xs sm:text-sm">{targetProfile.email}</CardDescription>
              )}
              <div className="inline-flex items-center gap-2 rounded-md bg-muted py-1 px-2 text-xs sm:text-sm">
                <span className="font-medium">{rank}</span>
              </div>
            </div>
          </div>
           {medalSrc && <img src={medalSrc} alt={rank} className="h-28 w-28 sm:h-32 sm:w-32 md:h-[140px] md:w-[140px] rounded-md object-contain" />}
        </CardHeader>
         {!isSelf && (
          <CardContent className="p-4 sm:p-6 border-t">
            <div className="flex flex-col sm:flex-row gap-2">
              {friendStatus === "none" && (
                <Button onClick={handleAdd} className="w-full sm:w-auto"><UserPlus className="mr-2 h-4 w-4" />Add Friend</Button>
              )}
              {friendStatus === "outgoing" && (
                <Button variant="outline" onClick={handleCancel} className="w-full sm:w-auto"><Send className="mr-2 h-4 w-4" />Cancel Request</Button>
              )}
              {friendStatus === "incoming" && (
                <>
                  <Button onClick={handleAccept} className="w-full sm:w-auto"><UserCheck className="mr-2 h-4 w-4" />Accept</Button>
                  <Button variant="outline" onClick={handleReject} className="w-full sm:w-auto"><UserX className="mr-2 h-4 w-4" />Reject</Button>
                </>
              )}
              {friendStatus === "friends" && (
                <Button variant="destructive" onClick={handleRemove} className="w-full sm:w-auto"><UserX className="mr-2 h-4 w-4" />Remove Friend</Button>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        <StatCard icon={LineChartIcon} label="Current ELO" value={targetProfile.globalElo} />
        <StatCard icon={ListOrdered} label="Matches" value={stats.total} />
        <StatCard icon={Percent} label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} />
        <StatCard icon={Flame} label="Max Streak" value={stats.maxWinStreak} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
         <AchievementsPanel
            achievements={targetProfile.achievements ?? []}
            overallMatches={stats.total}
            overallWins={stats.wins}
            overallMaxStreak={stats.maxWinStreak}
          />

        <div className="flex flex-col gap-4">
          <PieCard title="Win / Loss" icon={PieChartIcon} data={pieData} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PieCard title="Left vs Right Wins" icon={CornerUpLeft} data={sidePieData} isSmall={true} />
            <PieCard title="Left vs Right Losses" icon={CornerUpRight} data={sidePieLossData} isSmall={true} />
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
        <span className="font-medium text-sm sm:text-base">Filter by Opponent:</span>
        <Select value={oppFilter} onValueChange={setOppFilter}>
          <SelectTrigger className="w-full sm:w-64">
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

      <DetailedStatsCard stats={stats} side={sideStats} />

      <div className="space-y-6 sm:space-y-8">
        <ChartCard title="ELO History" icon={LineChartIcon}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={perfData} margin={{ top: 5, right: 20, left: -20, bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={50} interval="preserveStartEnd" />
              <YAxis domain={["dataMin-20", "dataMax+20"]} tick={{ fontSize: 10 }} />
              <RechartTooltip content={<CustomTooltip />} />
              <ReLegend wrapperStyle={{fontSize: "12px"}} />
              <Line type="monotone" dataKey="rating" stroke="hsl(var(--primary))" dot={{ r: 2 }} activeDot={{ r: 4 }} />
              {perfData.length > 1 && (
                 <Brush
                  dataKey="label"
                  height={20}
                  stroke="hsl(var(--primary))"
                  travellerWidth={10}
                  startIndex={Math.max(0, perfData.length - Math.min(perfData.length, 20) )} // Show last 20 or all if less
                  endIndex={perfData.length - 1}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Match Result (Win/Loss)" icon={Activity}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={perfData} margin={{ top: 5, right: 20, left: -20, bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={50} interval="preserveStartEnd" />
              <YAxis domain={[-1.2, 1.2]} ticks={[-1, 0, 1]} tickFormatter={(v) => v === 1 ? "Win" : v === -1 ? "Loss" : "N/A"} tick={{ fontSize: 10 }} />
              <RechartTooltip content={<CustomTooltip />} />
              <ReLegend wrapperStyle={{fontSize: "12px"}} />
              <Line type="stepAfter" dataKey="result" name="Result" stroke="hsl(var(--accent))" dot={{ r: 2 }} activeDot={{ r: 4 }} />
               {perfData.length > 1 && (
                <Brush
                  dataKey="label"
                  height={20}
                  stroke="hsl(var(--accent))"
                  travellerWidth={10}
                  startIndex={Math.max(0, perfData.length - Math.min(perfData.length, 20) )}
                  endIndex={perfData.length - 1}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Score Difference" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={perfData} margin={{ top: 5, right: 20, left: -20, bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={50} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} />
              <RechartTooltip content={<CustomTooltip />} />
              <ReLegend wrapperStyle={{fontSize: "12px"}} />
              <Line type="monotone" dataKey="diff" name="Score Diff." stroke="hsl(var(--destructive))" dot={{ r: 2 }} activeDot={{ r: 4 }} />
              {perfData.length > 1 && (
                <Brush
                  dataKey="label"
                  height={20}
                  stroke="hsl(var(--destructive))"
                  travellerWidth={10}
                  startIndex={Math.max(0, perfData.length - Math.min(perfData.length, 20) )}
                  endIndex={perfData.length - 1}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <MatchesTableCard
        title={`Match History (${filtered.length})`}
        matches={filtered}
        loading={loadingMatches}
        meUid={targetUid}
      />
    </section>
  );
}

// ---------------- Reusable Components ----------------

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <Card className="shadow">
      <CardContent className="flex flex-col items-center text-center p-3 sm:p-4">
        <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary mb-1 sm:mb-2" />
        <p className="text-xs sm:text-sm text-muted-foreground">{label}</p>
        <p className="text-lg sm:text-xl md:text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <Card className="shadow-md">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg md:text-xl">
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2 sm:p-4 md:p-6 pt-0">{children}</CardContent>
    </Card>
  );
}

function PieCard({ title, icon: Icon, data, isSmall = false }: { title: string; icon: any; data: { name: string; value: number; fill: string }[], isSmall?: boolean; children?: React.ReactNode }) {
  const outerRadius = isSmall ? 60 : 80;
  const height = isSmall ? 250 : 300;
  return (
    <Card className="shadow-md h-full">
      <CardHeader className="p-4">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className={`h-[${height}px] w-full p-2 sm:p-4`}>
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={outerRadius} labelLine={false} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} stroke="hsl(var(--background))" legendType="square"
             className="text-xs sm:text-sm"
            />
            <ReLegend wrapperStyle={{fontSize: "10px", marginTop: "10px"}} />
            <RechartTooltip wrapperStyle={{fontSize: "12px"}}/>
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function DetailedStatsCard({ stats, side }: { stats: ReturnType<typeof computeStats>; side: ReturnType<typeof computeSideStats> }) {
  return (
    <Card className="shadow-md">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg md:text-xl">
          <CornerUpLeft className="h-4 w-4 sm:h-5 sm:w-5" /> / <CornerUpRight className="h-4 w-4 sm:h-5 sm:w-5" /> Detailed Statistics
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 text-xs sm:text-sm p-4 sm:p-6">
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
        <StatItem l="Left Side W/L" v={`${side.leftSideWins} / ${side.leftSideLosses}`} />
        <StatItem l="Right Side W/L" v={`${side.rightSideWins} / ${side.rightSideLosses}`} />
      </CardContent>
    </Card>
  );
}

function StatItem({ l, v }: { l: string; v: React.ReactNode }) {
  return (
    <div>
      <p className="font-semibold">{l}</p>
      <p className="text-muted-foreground">{v}</p>
    </div>
  );
}

function MatchesTableCard({ title, matches, loading, meUid }: { title: string; matches: Match[]; loading: boolean; meUid: string }) {
  return (
    <Card className="shadow-md">
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-base sm:text-lg md:text-xl">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0 sm:p-2 md:p-4">
        {loading ? (
          <div className="text-center py-8">Loading…</div>
        ) : matches.length === 0 ? (
          <p className="text-center py-8 text-sm sm:text-base">No matches found.</p>
        ) : (
          <ScrollArea className="h-[300px] sm:h-[400px] w-full">
            <Table className="min-w-[600px] sm:min-w-full">
              <React.Fragment>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs sm:text-sm">Date</TableHead>
                    <TableHead className="text-xs sm:text-sm">Opponent</TableHead>
                    <TableHead className="text-xs sm:text-sm">Score</TableHead>
                    <TableHead className="text-xs sm:text-sm">Result</TableHead>
                    <TableHead className="text-xs sm:text-sm">ELO Δ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matches.map((m) => {
                    const isP1 = m.player1Id === meUid;
                    const date = safeFormatDate(m.timestamp ?? m.playedAt, "dd.MM.yy HH:mm");
                    const oppName = isP1 ? m.player2.name : m.player1.name;
                    const oppId = isP1 ? m.player2Id : m.player1Id;
                    const myScore = isP1 ? m.player1.scores : m.player2.scores;
                    const theirScore = isP1 ? m.player2.scores : m.player1.scores;
                    const eloΔ = isP1 ? m.player1.addedPoints : m.player2.addedPoints;
                    const win = myScore > theirScore;
                    return (
                      <TableRow key={m.id} className="text-xs sm:text-sm">
                        <TableCell>{date}</TableCell>
                        <TableCell>
                          <Link href={`/profile/${oppId}`} className="hover:underline text-primary">
                            {oppName}
                          </Link>
                        </TableCell>
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
              </React.Fragment>
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
    <Link href={`/profile/${uid}`} className="inline-flex items-center gap-2 px-2 py-1 sm:px-3 sm:py-1 rounded-md bg-muted hover:bg-muted/70">
      <Avatar className="h-5 w-5 sm:h-6 sm:w-6">
        {info.photoURL ? <AvatarImage src={info.photoURL} /> : <AvatarFallback className="text-xs">{info.name.charAt(0)}</AvatarFallback>}
      </Avatar>
      <span className="text-xs sm:text-sm">{info.name}</span>
    </Link>
  );
}

    