"use client";

import PlayersTable from "@/components/PlayersTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import type { Match, Room } from "@/lib/types";
import { parseFlexDate } from "@/lib/utils/date";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { ArrowRight, Flame, LogIn, Percent, Rocket, Trophy, User, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ, ВЗЯТЫЕ СО СТРАНИЦЫ ПРОФИЛЯ ---

const getRank = (elo: number) => {
  if (elo < 1001) return 'Ping-Pong Padawan';
  if (elo < 1100) return 'Table-Tennis Trainee';
  if (elo < 1200) return 'Racket Rookie';
  if (elo < 1400) return 'Paddle Prodigy';
  if (elo < 1800) return 'Spin Sensei';
  if (elo < 2000) return 'Smash Samurai';
  return 'Ping-Pong Paladin';
};

// Функция для вычисления основной статистики
function computeStats(list: Match[], uid: string) {
  let wins = 0,
    losses = 0,
    curW = 0,
    maxW = 0;

  list.forEach((m) => {
    const p1 = m.player1Id === uid;
    const me = p1 ? m.player1 : m.player2;
    const opp = p1 ? m.player2 : m.player1;
    const win = me.scores > opp.scores;
    if (win) {
      wins++;
      curW++;
      maxW = Math.max(maxW, curW);
    } else {
      losses++;
      curW = 0;
    }
  });

  const total = wins + losses;
  return {
    total,
    wins,
    losses,
    winRate: total ? (wins / total) * 100 : 0,
    maxWinStreak: maxW,
  };
}


export default function Home() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const visibleName = userProfile?.name ?? user?.displayName ?? "Player";

  // --- ЛОГИКА ПОИСКА ПОСЛЕДНЕЙ КОМНАТЫ ---
  const [lastActiveRoom, setLastActiveRoom] = useState<(Room & { id: string }) | null>(null);
  const [isFetchingRoom, setIsFetchingRoom] = useState(true);

  useEffect(() => {
    const fetchLastActiveRoom = async () => {
      if (!user) {
        setIsFetchingRoom(false);
        return;
      }
      setIsFetchingRoom(true);
      try {
        const matchesQuery = query(
          collection(db, 'matches'),
          where('players', 'array-contains', user.uid),
          orderBy('tsIso', 'desc'),
          limit(1)
        );
        const matchSnap = await getDocs(matchesQuery);

        if (!matchSnap.empty) {
          const lastMatch = matchSnap.docs[0].data();
          const roomDoc = await getDoc(doc(db, 'rooms', lastMatch.roomId));
          if (roomDoc.exists()) {
            setLastActiveRoom({ id: roomDoc.id, ...roomDoc.data() } as Room & { id: string });
          }
        }
      } catch (error) {
        console.error("Failed to fetch last active room:", error);
      } finally {
        setIsFetchingRoom(false);
      }
    };

    if (!authLoading) {
      fetchLastActiveRoom();
    }
  }, [user, authLoading]);

  // --- НОВАЯ ЛОГИКА: ЗАГРУЗКА МАТЧЕЙ И ВЫЧИСЛЕНИЕ СТАТИСТИКИ ---
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  const loadMatches = useCallback(async () => {
    if (!user) return;
    setIsLoadingStats(true);
    try {
      const ref = collection(db, "matches");
      const [p1, p2] = await Promise.all([
        getDocs(query(ref, where("player1Id", "==", user.uid))),
        getDocs(query(ref, where("player2Id", "==", user.uid))),
      ]);
      const rows: Match[] = [];
      p1.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
      p2.forEach((d) => rows.push({ id: d.id, ...(d.data() as any) }));
      const uniq = Array.from(new Map(rows.map((r) => [r.id, r])).values()).sort(
        (a, b) =>
          parseFlexDate(b.timestamp ?? (b as any).playedAt).getTime() -
          parseFlexDate(a.timestamp ?? (a as any).playedAt).getTime()
      );
      setMatches(uniq);
    } catch (error) {
       console.error("Failed to load matches for stats:", error);
    } finally {
      setIsLoadingStats(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && user) {
      loadMatches();
    }
  }, [authLoading, user, loadMatches]);

  const stats = useMemo(() => {
    if (!user || !matches.length) return null;
    return computeStats(matches, user.uid);
  }, [matches, user]);

  // --- КОНЕЦ НОВОЙ ЛОГИКИ ---

  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen">
      <main className="container mx-auto px-4 py-12">
        {/* --- СЕКЦИЯ ПРИВЕТСТВИЯ --- */}
        <section className="text-center mb-12">
          <h1 className="text-5xl font-extrabold tracking-tight mb-4 sm:text-6xl md:text-7xl bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-400">
            PingPongTracker
          </h1>
          <p className="max-w-3xl mx-auto text-lg text-muted-foreground sm:text-xl">
            Your ultimate hub to track matches, climb the leaderboard, and become a champion.
          </p>
        </section>

        {/* --- ОСНОВНОЙ КОНТЕНТ (ДАШБОРД ИЛИ ПРИЗЫВ К ДЕЙСТВИЮ) --- */}
        {authLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary"></div>
          </div>
        ) : user ? (
          // --- ДАШБОРД ДЛЯ АВТОРИЗОВАННОГО ПОЛЬЗОВАТЕЛЯ ---
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* --- ЛЕВАЯ КОЛОНКА: БЫСТРЫЕ ДЕЙСТВИЯ И ТАБЛИЦА ЛИДЕРОВ --- */}
            <div className="lg:col-span-2 space-y-8">
              
              {/* --- КАРТОЧКА БЫСТРЫХ ДЕЙСТВИЙ --- */}
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle>Quick Start</CardTitle>
                  <CardDescription>Welcome back, {visibleName}! What's next?</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isFetchingRoom ? (
                     <Button size="lg" className="w-full animate-pulse" disabled>
                        <Rocket className="mr-2 h-5 w-5" /> Searching for your last game...
                     </Button>
                  ) : lastActiveRoom ? (
                    <Button size="lg" asChild className="w-full bg-green-600 hover:bg-green-700 text-white shadow-lg transform transition-transform">
                      <Link href={`/rooms/${lastActiveRoom.id}`}>
                        <Rocket className="mr-2 h-5 w-5" />
                        Jump back into: {lastActiveRoom.name}
                      </Link>
                    </Button>
                  ) : null}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
                     <Button variant="outline" asChild>
                        <Link href={`/profile/${user.uid}`}><User className="mr-2 h-4 w-4" /> Your Profile</Link>
                     </Button>
                     <Button variant="outline" asChild>
                        <Link href="/rooms"><Users className="mr-2 h-4 w-4" /> All Rooms</Link>
                     </Button>
                     <Button variant="outline" asChild>
                        <Link href="/tournaments"><Trophy className="mr-2 h-4 w-4" /> Tournaments</Link>
                     </Button>
                  </div>
                </CardContent>
              </Card>

              <PlayersTable />
            </div>

            {/* --- ПРАВАЯ КОЛОНКА: ПРОФИЛЬ И ДОПОЛНИТЕЛЬНЫЕ ССЫЛКИ --- */}
            <div className="space-y-8">
              {/* --- УЛУЧШЕННАЯ КАРТОЧКА ПРОФИЛЯ --- */}
              <Card className="shadow-lg">
                 <CardHeader>
                    <CardTitle>Your Profile</CardTitle>
                    <CardDescription>A quick glance at your progress.</CardDescription>
                 </CardHeader>
                 <CardContent className="space-y-4 text-sm">
                   {isLoadingStats ? (
                     <div className="text-center text-muted-foreground py-4">Loading stats...</div>
                   ) : (
                     <>
                        <div className="flex justify-between items-center">
                           <span className="text-muted-foreground">Global ELO</span>
                           <span className="font-bold text-lg text-primary">{userProfile?.globalElo?.toFixed(0) ?? 'N/A'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                           <span className="text-muted-foreground">Rank</span>
                           <span className="font-semibold">{getRank(userProfile?.globalElo ?? 1000)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                           <span className="text-muted-foreground">Win Rate</span>
                           <span className="font-semibold flex items-center gap-1"><Percent className="h-4 w-4 text-green-500"/>{stats?.winRate.toFixed(1) ?? '0.0'}%</span>
                        </div>
                         <div className="flex justify-between items-center">
                           <span className="text-muted-foreground">W / L</span>
                           <span className="font-semibold">{stats?.wins ?? 0} / {stats?.losses ?? 0}</span>
                        </div>
                        <div className="flex justify-between items-center">
                           <span className="text-muted-foreground">Best Streak</span>
                           <span className="font-semibold flex items-center gap-1"><Flame className="h-4 w-4 text-orange-500"/>{stats?.maxWinStreak ?? 0}</span>
                        </div>
                     </>
                   )}
                 </CardContent>
                 <CardFooter>
                    <Button asChild variant="secondary" className="w-full">
                       <Link href={`/profile/${user.uid}`}>View Full Stats <ArrowRight className="ml-2 h-4 w-4" /></Link>
                    </Button>
                 </CardFooter>
              </Card>

              <Card className="shadow-lg bg-gradient-to-br from-blue-500 to-primary text-white">
                 <CardHeader>
                    <CardTitle>Ping-Pong WRAP ’25</CardTitle>
                    <CardDescription className="text-blue-100">See your yearly stats summary!</CardDescription>
                 </CardHeader>
                 <CardFooter>
                    <Button asChild variant="secondary" className="w-full">
                       <Link href="/wrap-2025">View Your Wrap <ArrowRight className="ml-2 h-4 w-4" /></Link>
                    </Button>
                 </CardFooter>
              </Card>
            </div>

          </section>
        ) : (
          // --- СЕКЦИЯ ДЛЯ НЕАВТОРИЗОВАННЫХ ПОЛЬЗОВАТЕЛЕЙ ---
          <section className="text-center max-w-lg mx-auto">
            <Card className="shadow-xl">
              <CardHeader>
                <CardTitle className="text-3xl">Get Started</CardTitle>
                <CardDescription>Join the community and start tracking your progress today!</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" asChild className="flex-1">
                  <Link href="/login" className="flex items-center gap-2">
                    <LogIn /> Login
                  </Link>
                </Button>
                <Button size="lg" variant="secondary" asChild className="flex-1">
                  <Link href="/register" className="flex items-center gap-2">
                    <UserPlus /> Register
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </section>
        )}

        {/* --- СЕКЦИЯ "ПОЧЕМУ МЫ" --- */}
        <section className="mt-20">
          <h2 className="text-3xl font-semibold text-center mb-8">Why PingPongTracker?</h2>
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div className="p-6 bg-card rounded-lg shadow-md border">
              <Trophy className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Advanced ELO System</h3>
              <p className="text-muted-foreground">Track your skill progression with a reliable and accurate rating system.</p>
            </div>
            <div className="p-6 bg-card rounded-lg shadow-md border">
              <Users className="h-12 w-12 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Community & Rooms</h3>
              <p className="text-muted-foreground">Organize casual matches or compete in structured seasons with friends.</p>
            </div>
            <div className="p-6 bg-card rounded-lg shadow-md border">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-12 w-12 text-primary mx-auto mb-4"><path d="M12 20V10M18 20V4M6 20V16" /></svg>
              <h3 className="text-xl font-semibold mb-2">In-depth Statistics</h3>
              <p className="text-muted-foreground">Analyze your performance with detailed match history and personal stats.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
