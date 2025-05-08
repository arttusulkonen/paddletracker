// src/app/profile/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  BarChart3,
  CheckCircle,
  ListOrdered,
  Percent,
  UserCircle,
  XCircle,
} from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import {
  ResponsiveContainer,
  LineChart as ReLineChart,
  Line,
  PieChart as RePieChart,
  Pie,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  Legend as ReLegend,
} from "recharts";
import type { Match, UserProfile as UserProfileType } from "@/lib/types";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function ProfilePage() {
  const { user, userProfile, loading } = useAuth();
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);
  const [isMatchesLoading, setIsMatchesLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchRecentMatches = async () => {
      setIsMatchesLoading(true);
      try {
        const matchesRef = collection(db, "matches");
        const q1 = query(
          matchesRef,
          where("player1Id", "==", user.uid),
          orderBy("playedAt", "desc"),
          limit(5)
        );
        const q2 = query(
          matchesRef,
          where("player2Id", "==", user.uid),
          orderBy("playedAt", "desc"),
          limit(5)
        );
        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        const all: Match[] = [];
        snap1.forEach((d) => all.push({ id: d.id, ...(d.data() as any) }));
        snap2.forEach((d) => all.push({ id: d.id, ...(d.data() as any) }));
        const unique = Array.from(new Map(all.map((m) => [m.id, m])).values());
        unique.sort(
          (a, b) => b.playedAt.toMillis() - a.playedAt.toMillis()
        );
        setRecentMatches(unique.slice(0, 5));
      } catch (e) {
        console.error(e);
      } finally {
        setIsMatchesLoading(false);
      }
    };
    fetchRecentMatches();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-10rem)]">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary" />
      </div>
    );
  }

  if (!user || !userProfile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)] text-center">
        <p className="text-2xl font-semibold mb-4">
          Please log in to view your profile.
        </p>
        <Button asChild>
          <Link href="/login">Login</Link>
        </Button>
      </div>
    );
  }

  const winPct =
    userProfile.matchesPlayed > 0
      ? ((userProfile.wins / userProfile.matchesPlayed) * 100).toFixed(1)
      : "0";

  const eloHistory =
    userProfile.eloHistory?.map((e) => ({
      date: e.date.toDate(),
      elo: e.elo,
    })) || [{ date: new Date(), elo: userProfile.globalElo }];

  const winLossData = [
    { name: "Wins", value: userProfile.wins, fill: "hsl(var(--accent))" },
    {
      name: "Losses",
      value: userProfile.losses,
      fill: "hsl(var(--destructive))",
    },
  ];

  const formatEur = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "EUR",
    }).format(n);

  return (
    <div className="container mx-auto py-8 px-4">
      {/* PROFILE HEADER */}
      <Card className="mb-8 shadow-lg overflow-hidden">
        <CardHeader className="bg-muted/50 p-6 flex flex-col md:flex-row items-center gap-6">
          <Avatar className="h-24 w-24 border-4 border-background shadow-md">
            <AvatarImage
              src={userProfile.photoURL || undefined}
              alt={userProfile.displayName || "User"}
            />
            <AvatarFallback className="text-4xl">
              {userProfile.displayName
                ? userProfile.displayName.charAt(0).toUpperCase()
                : <UserCircle />}
            </AvatarFallback>
          </Avatar>
          <div className="text-center md:text-left">
            <CardTitle className="text-4xl font-bold">
              {userProfile.displayName || "Player"}
            </CardTitle>
            <CardDescription className="text-lg text-muted-foreground">
              {userProfile.email}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Stat icon={<BarChart3 />} title="ELO Rating" value={userProfile.globalElo.toString()} />
          <Stat icon={<ListOrdered />} title="Matches Played" value={userProfile.matchesPlayed.toString()} />
          <Stat icon={<CheckCircle />} title="Wins" value={userProfile.wins.toString()} />
          <Stat icon={<XCircle />} title="Losses" value={userProfile.losses.toString()} />
          <Stat icon={<Percent />} title="Win %" value={`${winPct}%`} />
        </CardContent>
      </Card>

      {/* CHARTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* ELO HISTORY */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LineChartIcon /> ELO Rating History
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {eloHistory.length > 1 ? (
              <ChartContainer config={{ elo: { label: "ELO", color: "var(--primary)" } }} className="h-full w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ReLineChart data={eloHistory}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(d) => format(d, "MMM d")} />
                    <YAxis domain={["dataMin - 20", "dataMax + 20"]} />
                    <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    <Line type="monotone" dataKey="elo" stroke="var(--primary)" dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </ReLineChart>
                </ResponsiveContainer>
              </ChartContainer>
            ) : (
              <p className="text-center text-muted-foreground h-full flex items-center justify-center">
                Not enough data for ELO chart.
              </p>
            )}
          </CardContent>
        </Card>

        {/* WIN/LOSS PIE */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon /> Win/Loss Ratio
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {userProfile.matchesPlayed > 0 ? (
              <ChartContainer config={{ wins: { label: "Wins", color: "var(--accent)" }, losses: { label: "Losses", color: "var(--destructive)" } }} className="h-full w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                    <Pie data={winLossData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} labelLine={false} label={({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
                      const RAD = Math.PI / 180;
                      const r = innerRadius + (outerRadius - innerRadius) * 0.5;
                      const x = cx + r * Math.cos(-midAngle * RAD);
                      const y = cy + r * Math.sin(-midAngle * RAD);
                      return (
                        <text x={x} y={y} fill="white" textAnchor={x > cx ? "start" : "end"} dominantBaseline="central">
                          {`${(percent * 100).toFixed(0)}%`}
                        </text>
                      );
                    }} />
                    <ReLegend content={<ChartLegendContent nameKey="name" />} />
                  </RePieChart>
                </ResponsiveContainer>
              </ChartContainer>
            ) : (
              <p className="text-center text-muted-foreground h-full flex items-center justify-center">
                No matches played yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* RECENT MATCHES */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChartIcon /> Recent Matches
          </CardTitle>
          <CardDescription>Your last 5 played matches.</CardDescription>
        </CardHeader>
        <CardContent>
          {isMatchesLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
            </div>
          ) : recentMatches.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Opponent</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>ELO Change</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentMatches.map((m) => {
                  const isP1 = m.player1Id === user.uid;
                  const opp = isP1 ? m.player2Name : m.player1Name;
                  const us = isP1 ? m.player1Score : m.player2Score;
                  const them = isP1 ? m.player2Score : m.player1Score;
                  const change = isP1 ? m.eloChangePlayer1 : m.eloChangePlayer2;
                  const result = m.winnerId === user.uid ? "Win" : "Loss";
                  return (
                    <TableRow key={m.id}>
                      <TableCell>{opp || "Unknown"}</TableCell>
                      <TableCell>{`${us} - ${them}`}</TableCell>
                      <TableCell className={result === "Win" ? "text-accent" : "text-destructive"}>
                        {result}
                      </TableCell>
                      <TableCell className={change >= 0 ? "text-accent" : "text-destructive"}>
                        {change > 0 ? `+${change}` : change}
                      </TableCell>
                      <TableCell>{format(m.playedAt.toDate(), "PPp")}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">No recent matches found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// inline helper
function Stat({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return (
    <div className="bg-background p-4 rounded-lg shadow flex items-center gap-4">
      <div className="p-3 bg-primary/10 rounded-full">{icon}</div>
      <div>
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </div>
    </div>
  );
}