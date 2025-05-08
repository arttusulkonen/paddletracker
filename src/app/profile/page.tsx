"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { BarChart, LineChart, PieChart, UserCircle, BarChart3, CheckCircle, XCircle, ListOrdered, Percent } from 'lucide-react';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { Bar, Line, Pie, ResponsiveContainer } from "recharts";
import { Match, UserProfile as UserProfileType } from '@/lib/types';
import { collection, query, where, orderBy, getDocs, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const chartConfig = {
  elo: {
    label: "ELO Rating",
    color: "hsl(var(--primary))",
  },
  wins: {
    label: "Wins",
    color: "hsl(var(--accent))",
  },
  losses: {
    label: "Losses",
    color: "hsl(var(--destructive))",
  },
};

export default function ProfilePage() {
  const { user, userProfile, loading } = useAuth();
  const [recentMatches, setRecentMatches] = useState<Match[]>([]);
  const [isMatchesLoading, setIsMatchesLoading] = useState(true);

  useEffect(() => {
    if (user) {
      const fetchRecentMatches = async () => {
        setIsMatchesLoading(true);
        try {
          const matchesRef = collection(db, "matches");
          // Query for matches where player1Id or player2Id is the current user
          const qPlayer1 = query(matchesRef, where("player1Id", "==", user.uid), orderBy("playedAt", "desc"), limit(5));
          const qPlayer2 = query(matchesRef, where("player2Id", "==", user.uid), orderBy("playedAt", "desc"), limit(5));
          
          const [player1Snap, player2Snap] = await Promise.all([getDocs(qPlayer1), getDocs(qPlayer2)]);
          
          const matchesData: Match[] = [];
          player1Snap.forEach(doc => matchesData.push({ id: doc.id, ...doc.data() } as Match));
          player2Snap.forEach(doc => matchesData.push({ id: doc.id, ...doc.data() } as Match));

          // Sort combined matches by date and take latest 5 (avoid duplicates if any)
          const uniqueMatches = Array.from(new Map(matchesData.map(match => [match.id, match])).values());
          uniqueMatches.sort((a, b) => b.playedAt.toMillis() - a.playedAt.toMillis());
          
          setRecentMatches(uniqueMatches.slice(0, 5));
        } catch (error) {
          console.error("Error fetching recent matches:", error);
        } finally {
          setIsMatchesLoading(false);
        }
      };
      fetchRecentMatches();
    }
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-10rem)]">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary"></div>
      </div>
    );
  }

  if (!user || !userProfile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)] text-center">
        <p className="text-2xl font-semibold mb-4">Please log in to view your profile.</p>
        <Button asChild>
          <Link href="/login">Login</Link>
        </Button>
      </div>
    );
  }

  const winPercentage = userProfile.matchesPlayed > 0 ? ((userProfile.wins / userProfile.matchesPlayed) * 100).toFixed(1) : '0';

  const eloHistoryData = userProfile.eloHistory?.map(entry => ({
    date: entry.date.toDate(), // Assuming entry.date is a Firestore Timestamp
    elo: entry.elo,
  })) || [{ date: new Date(), elo: userProfile.globalElo}]; // Fallback if no history


  const winLossData = [
    { name: 'Wins', value: userProfile.wins, fill: 'hsl(var(--accent))' },
    { name: 'Losses', value: userProfile.losses, fill: 'hsl(var(--destructive))' },
  ];

  return (
    <div className="container mx-auto py-8 px-4">
      <Card className="mb-8 shadow-lg overflow-hidden">
        <CardHeader className="bg-muted/50 p-6 flex flex-col md:flex-row items-center gap-6">
          <Avatar className="h-24 w-24 border-4 border-background shadow-md">
            <AvatarImage src={userProfile.photoURL || undefined} alt={userProfile.displayName || "User"} />
            <AvatarFallback className="text-4xl">
              {userProfile.displayName ? userProfile.displayName.charAt(0).toUpperCase() : <UserCircle />}
            </AvatarFallback>
          </Avatar>
          <div className="text-center md:text-left">
            <CardTitle className="text-4xl font-bold">{userProfile.displayName || "Player"}</CardTitle>
            <CardDescription className="text-lg text-muted-foreground">{userProfile.email}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard icon={<BarChart3 className="text-primary" />} title="ELO Rating" value={userProfile.globalElo.toString()} />
          <StatCard icon={<ListOrdered className="text-primary" />} title="Matches Played" value={userProfile.matchesPlayed.toString()} />
          <StatCard icon={<CheckCircle className="text-accent" />} title="Wins" value={userProfile.wins.toString()} />
          <StatCard icon={<XCircle className="text-destructive" />} title="Losses" value={userProfile.losses.toString()} />
          <StatCard icon={<Percent className="text-primary" />} title="Win %" value={`${winPercentage}%`} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><LineChart className="text-primary"/> ELO Rating History</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {eloHistoryData.length > 1 ? (
            <ChartContainer config={chartConfig} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={eloHistoryData} margin={{ top: 5, right: 20, left: -25, bottom: 5 }}>
                  <CartesianGrid_ strokeDasharray="3 3" vertical={false}/>
                  <XAxis_ dataKey="date" tickFormatter={(tick) => format(new Date(tick), 'MMM d')} />
                  <YAxis_ domain={['dataMin - 20', 'dataMax + 20']} />
                  <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                  <Line type="monotone" dataKey="elo" stroke="var(--color-elo)" strokeWidth={2} dot={{ r: 4, fill: "var(--color-elo)" }} activeDot={{ r: 6 }}/>
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
            ) : (
              <p className="text-center text-muted-foreground h-full flex items-center justify-center">Not enough data for ELO history chart.</p>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><PieChart className="text-primary"/> Win/Loss Ratio</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {userProfile.matchesPlayed > 0 ? (
            <ChartContainer config={chartConfig} className="h-full w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                  <Pie data={winLossData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} labelLine={false} 
                    label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
                        const RADIAN = Math.PI / 180;
                        const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                        const y = cy + radius * Math.sin(-midAngle * RADIAN);
                        return (
                          <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
                            {`${(percent * 100).toFixed(0)}%`}
                          </text>
                        );
                      }}
                  />
                  <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                </PieChart>
              </ResponsiveContainer>
            </ChartContainer>
            ) : (
              <p className="text-center text-muted-foreground h-full flex items-center justify-center">No matches played yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BarChart className="text-primary"/> Recent Matches</CardTitle>
          <CardDescription>Your last 5 played matches.</CardDescription>
        </CardHeader>
        <CardContent>
          {isMatchesLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
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
                {recentMatches.map((match) => {
                  const isPlayer1 = match.player1Id === user.uid;
                  const opponentName = isPlayer1 ? match.player2Name : match.player1Name;
                  const userScore = isPlayer1 ? match.player1Score : match.player2Score;
                  const opponentScore = isPlayer1 ? match.player2Score : match.player1Score;
                  const eloChange = isPlayer1 ? match.eloChangePlayer1 : match.eloChangePlayer2;
                  const result = match.winnerId === user.uid ? "Win" : "Loss";

                  return (
                    <TableRow key={match.id}>
                      <TableCell>{opponentName || 'Unknown Player'}</TableCell>
                      <TableCell>{`${userScore} - ${opponentScore}`}</TableCell>
                      <TableCell className={result === "Win" ? "text-accent" : "text-destructive"}>
                        {result}
                      </TableCell>
                      <TableCell className={eloChange >= 0 ? "text-accent" : "text-destructive"}>
                        {eloChange > 0 ? `+${eloChange}` : eloChange}
                      </TableCell>
                      <TableCell>{format(match.playedAt.toDate(), 'PPp')}</TableCell>
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

// Helper components for cleaner JSX
// These are re-defined here for simplicity. In a larger app, they would be in separate files.
const StatCard = ({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) => (
  <div className="bg-background p-4 rounded-lg shadow flex items-center gap-4">
    <div className="p-3 bg-primary/10 rounded-full">{icon}</div>
    <div>
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  </div>
);

// Recharts components with _ suffix to avoid conflict with shadcn chart components if imported directly
const XAxis_ = (Recharts as any).XAxis;
const YAxis_ = (Recharts as any).YAxis;
const CartesianGrid_ = (Recharts as any).CartesianGrid;
