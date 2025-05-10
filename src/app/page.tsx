"use client";

import PlayersTable from "@/components/PlayersTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowRight, LogIn, TrophyIcon, UserPlus, UsersIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";


export default function Home() {
  const { user, loading } = useAuth();
    const visibleName = user?.displayName ?? user?.name;

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)] py-12">
      <section className="text-center mb-12">
        <h1 className="text-5xl font-extrabold tracking-tight mb-4 sm:text-6xl md:text-7xl">
          Welcome to <span className="text-primary">PaddleTracker</span>
        </h1>
        <p className="max-w-2xl mx-auto text-lg text-muted-foreground sm:text-xl">
          Track your ping-pong matches, manage tournaments, analyze your ELO rating, and climb the leaderboard!
        </p>
      </section>

      {/* <section className="mb-12 w-full max-w-4xl">
        <Image
          src="https://picsum.photos/1200/400"
          alt="Ping pong action"
          width={1200}
          height={400}
          className="rounded-lg shadow-xl object-cover"
          data-ai-hint="ping pong table"
        />
      </section> */}

      {loading ? (
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : user ? (
        <section className="text-center">
          <h2 className="text-3xl font-semibold mb-6">Hello, {visibleName || "Player"}!</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><UserPlus className="text-primary" /> Your Profile</CardTitle>
              </CardHeader>
              <CardContent>
                <p>View your stats and ELO history.</p>
              </CardContent>
              <CardFooter>
                <Button asChild className="w-full">
                  <Link href="/profile">Go to Profile <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
              </CardFooter>
            </Card>
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><UsersIcon className="text-primary" /> Match Rooms</CardTitle>
              </CardHeader>
              <CardContent>
                <p>Create or join rooms to play matches.</p>
              </CardContent>
              <CardFooter>
                <Button asChild className="w-full">
                  <Link href="/rooms">Explore Rooms <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
              </CardFooter>
            </Card>
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><TrophyIcon className="text-primary" /> Tournaments</CardTitle>
              </CardHeader>
              <CardContent>
                <p>Compete in exciting tournaments.</p>
              </CardContent>
              <CardFooter>
                <Button asChild className="w-full">
                  <Link href="/tournaments">View Tournaments <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
              </CardFooter>
            </Card>
          </div>
          <PlayersTable />
        </section>
      ) : (
        <section className="text-center">
          <h2 className="text-3xl font-semibold mb-6">Get Started</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild>
              <Link href="/login" className="flex items-center gap-2">
                <LogIn /> Login
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/register" className="flex items-center gap-2">
                <UserPlus /> Register
              </Link>
            </Button>
          </div>
        </section>
      )}

      <section className="mt-16 w-full max-w-4xl">
        <h2 className="text-3xl font-semibold text-center mb-8">Why PaddleTracker?</h2>
        <div className="grid md:grid-cols-3 gap-8 text-center">
          <div className="p-6 bg-card rounded-lg shadow-md">
            <TrophyIcon className="h-12 w-12 text-accent mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">ELO Rating System</h3>
            <p className="text-muted-foreground">Accurately track your skill progression with the widely recognized ELO system.</p>
          </div>
          <div className="p-6 bg-card rounded-lg shadow-md">
            <UsersIcon className="h-12 w-12 text-accent mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Rooms & Tournaments</h3>
            <p className="text-muted-foreground">Organize casual matches in rooms or compete in structured tournaments.</p>
          </div>
          <div className="p-6 bg-card rounded-lg shadow-md">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-12 w-12 text-accent mx-auto mb-4"><path d="M12 20V10M18 20V4M6 20V16" /></svg>
            <h3 className="text-xl font-semibold mb-2">Detailed Statistics</h3>
            <p className="text-muted-foreground">Analyze your performance with win/loss records, match history, and more.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
