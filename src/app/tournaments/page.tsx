// File: src/app/tournaments/page.tsx
'use client'
import { ProtectedRoute } from '@/components/ProtectedRoutes'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { db } from '@/lib/firebase'
import type { TournamentRoom } from '@/lib/types'
import { collection, onSnapshot } from 'firebase/firestore'
import { PlusCircle, SearchIcon, UsersIcon } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

export default function TournamentRoomsPage() {
  const { user } = useAuth()
  const { toast } = useToast()

  const [tournaments, setTournaments] = useState<TournamentRoom[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    if (!user) {
      setIsLoading(false)
      return
    }
    const col = collection(db, 'tournament-rooms')
    const unsub = onSnapshot(col, snap => {
      const arr = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
      // only those where user is participant
      const filtered = arr.filter(t =>
        Array.isArray(t.participants) &&
        t.participants.some((p: any) => p.userId === user.uid)
      )
      filtered.sort((a, b) => {
        const da = parseDate(a.createdAt)
        const dbt = parseDate(b.createdAt)
        return dbt.getTime() - da.getTime()
      })
      setTournaments(filtered)
      setIsLoading(false)
    }, err => {
      console.error(err)
      toast({ title: 'Error', description: 'Could not load tournaments.', variant: 'destructive' })
      setIsLoading(false)
    })
    return () => unsub()
  }, [user, toast])

  const filtered = useMemo(() =>
    tournaments.filter(t =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase())
    ), [tournaments, searchTerm]
  )

  return (
    <ProtectedRoute>
      <div className="container mx-auto py-8 px-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-4xl font-bold flex items-center gap-2">
            <UsersIcon className="h-8 w-8 text-primary" /> Tournaments
          </h1>
          <Button asChild>
            <Link href="/tournaments/create">
              <PlusCircle className="mr-2 h-5 w-5" /> New Tournament
            </Link>
          </Button>
        </div>
        <Card className="shadow-lg">
          <CardHeader>
            <div className="relative w-full max-w-md">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search tournaments…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10 w-full"
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin h-12 w-12 rounded-full border-b-2 border-primary" />
              </div>
            ) : filtered.length ? (
              <ScrollArea className="h-[400px]">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-1">
                  {filtered.map(t => (
                    <Card key={t.id} className="hover:shadow-md transition-shadow">
                      <CardHeader>
                        <CardTitle className="truncate">{t.name}</CardTitle>
                        <CardDescription>Created: {t.createdAt}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          Participants: {t.participants?.length ?? 0}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Champion: {t.champion?.name || '—'}
                        </p>
                      </CardContent>
                      <CardFooter>
                        <Button asChild className="w-full">
                          <Link href={`/tournaments/${t.id}`}>Enter</Link>
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                {searchTerm
                  ? 'No tournaments match your search'
                  : 'You are not registered in any tournaments yet'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  )
}

function parseDate(dateString: any) {
  if (typeof dateString !== 'string') return new Date(0)
  const [day, month, year] = dateString.split('.').map(Number)
  return new Date(year, month - 1, day)
}
