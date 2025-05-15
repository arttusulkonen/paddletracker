"use client"
import BracketView from '@/components/BracketView'
import { ProtectedRoute } from '@/components/ProtectedRoutes'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { db } from '@/lib/firebase'
import type { TournamentRoom } from '@/lib/types'
import { doc, getDoc } from 'firebase/firestore'
import { ArrowLeft } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

export default function TournamentPage() {
  const params = useParams()
  const router = useRouter()
  const tournamentId = params.tournamentId
  const { user, userProfile } = useAuth()
  const { toast } = useToast()

  const [tournament, setTournament] = useState<TournamentRoom | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchTournament = useCallback(async () => {
    if (!tournamentId) return
    setLoading(true)
    try {
      const snap = await getDoc(doc(db, 'tournament-rooms', tournamentId))
      if (snap.exists()) {
        setTournament({ id: snap.id, ...(snap.data() as any) })
      } else {
        toast({ title: 'Error', description: 'Tournament not found', variant: 'destructive' })
        router.push('/tournaments')
      }
    } catch (err) {
      console.error(err)
      toast({ title: 'Error', description: 'Could not load tournament', variant: 'destructive' })
      router.push('/tournaments')
    } finally {
      setLoading(false)
    }
  }, [tournamentId, router, toast])

  useEffect(() => {
    fetchTournament()
  }, [fetchTournament])

  if (loading || !tournament) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-10rem)]">
        <div className="animate-spin h-16 w-16 rounded-full border-b-4 border-primary" />
      </div>
    )
  }

  return (
    <ProtectedRoute>
      <div className="container mx-auto py-8 px-4">
        <Button variant="outline" className="mb-6" onClick={() => router.push('/tournaments')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Tournaments
        </Button>
        <h1 className="text-3xl font-bold mb-4 flex items-center gap-2">
          {tournament.name}
        </h1>
        <BracketView tournament={tournament} onUpdate={fetchTournament} />
      </div>
    </ProtectedRoute>
  )
}