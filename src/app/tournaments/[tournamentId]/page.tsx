
"use client"
import BracketView from '@/components/BracketView'
import { ProtectedRoute } from '@/components/ProtectedRoutes'
import { Button, Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { db } from '@/lib/firebase'
import type { TournamentRoom as Tournament } from '@/lib/types' // Use TournamentRoom as Tournament
import { safeFormatDate } from '@/lib/utils/date'
import { doc, getDoc, onSnapshot } from 'firebase/firestore' // Added onSnapshot
import { ArrowLeft, Users, CalendarDays, Trophy } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

export default function TournamentPage() {
  const params = useParams()
  const router = useRouter()
  const tournamentId = params.tournamentId as string // Ensure tournamentId is string
  const { user } = useAuth() // Removed userProfile as it's not used
  const { toast } = useToast()

  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [loading, setLoading] = useState(true)

  // Use onSnapshot for real-time updates
  useEffect(() => {
    if (!tournamentId) return;
    setLoading(true);
    const unsub = onSnapshot(doc(db, 'tournament-rooms', tournamentId), 
      (snap) => {
        if (snap.exists()) {
          setTournament({ id: snap.id, ...(snap.data() as any) } as Tournament);
        } else {
          toast({ title: 'Error', description: 'Tournament not found', variant: 'destructive' });
          router.push('/tournaments');
        }
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching tournament:", err);
        toast({ title: 'Error', description: 'Could not load tournament data.', variant: 'destructive' });
        setLoading(false);
        router.push('/tournaments');
      }
    );
    return () => unsub(); // Cleanup listener on unmount
  }, [tournamentId, router, toast]);


  if (loading || !tournament) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-10rem)]">
        <div className="animate-spin h-12 w-12 sm:h-16 sm:w-16 rounded-full border-b-4 border-primary" />
      </div>
    )
  }
  
  const onBracketUpdate = () => {
    // Data will be updated by onSnapshot, so this function can be empty or used for other side effects
    console.log("Bracket updated, real-time listener will refresh data.");
  };

  return (
    <ProtectedRoute>
      <div className="container mx-auto py-6 sm:py-8 px-2 sm:px-4">
        <Button variant="outline" size="sm" className="mb-4 sm:mb-6 text-xs sm:text-sm" onClick={() => router.push('/tournaments')}>
          <ArrowLeft className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Back to Tournaments
        </Button>
        
        <Card className="mb-6 sm:mb-8 shadow-md">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-xl sm:text-2xl md:text-3xl flex items-center gap-2">
              <Trophy className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
              {tournament.name}
            </CardTitle>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm text-muted-foreground mt-1 sm:mt-2">
              <div className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3 sm:h-4 sm:w-4" />
                <span>Created: {safeFormatDate(tournament.createdAt, "dd.MM.yyyy")}</span>
              </div>
              <div className="flex items-center gap-1">
                <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                <span>{tournament.participants?.length ?? 0} Participants</span>
              </div>
               <div className="flex items-center gap-1">
                <Trophy className="h-3 w-3 sm:h-4 sm:w-4" />
                <span>Champion: {tournament.champion?.name || (tournament.isFinished ? 'Pending' : 'Ongoing')}</span>
              </div>
            </div>
          </CardHeader>
        </Card>

        <BracketView tournament={tournament} onUpdate={onBracketUpdate} />
      </div>
    </ProtectedRoute>
  )
}
