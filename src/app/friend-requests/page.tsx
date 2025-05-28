
/* --------------------------------------------------------------------------
   src/app/friend-requests/page.tsx
----------------------------------------------------------------------------*/
"use client"

import {
  Button,
  Card, CardContent, CardDescription, CardHeader, CardTitle,
  ScrollArea
} from "@/components/ui"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useAuth } from "@/contexts/AuthContext"
import { db } from "@/lib/firebase"
import * as Friends from "@/lib/friends"
import { doc, getDoc } from "firebase/firestore"
import { Check, UserPlus, X } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"

type LiteUser = { uid: string; name: string; photoURL?: string }

export default function FriendRequestsPage() {
  const { user, userProfile } = useAuth()
  const [requests, setRequests] = useState<LiteUser[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      if (!userProfile || !user) { // Ensure user is also available if needed for auth checks
          setLoading(false); 
          return;
      }
      const incoming = userProfile.incomingRequests ?? []
      const arr: LiteUser[] = []
      for (const uid of incoming) {
        const snap = await getDoc(doc(db, "users", uid))
        if (snap.exists()) {
          const d = snap.data() as any
          arr.push({ uid, name: d.displayName ?? d.name ?? d.email ?? "Unknown", photoURL: d.photoURL })
        }
      }
      setRequests(arr)
      setLoading(false)
    }
    load()
  }, [userProfile, user]) // Added user to dependencies

  const handle = async (uid: string, accept: boolean) => {
    if (!user) return
    setRequests((prev) => prev.filter((p) => p.uid !== uid)) // Optimistic update
    if (accept) await Friends.acceptRequest(user.uid, uid)
    else await Friends.rejectRequest(user.uid, uid)
    // No need to manually refetch, AuthContext listener should update userProfile
  }

  return (
    <div className="container mx-auto py-6 sm:py-8 max-w-lg">
      <Card className="shadow-lg">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-xl sm:text-2xl flex items-center gap-2">
            <UserPlus className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
            Friend Requests
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Manage your incoming friend requests.</CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {loading ? (
            <div className="flex justify-center items-center py-10">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-10">
              <Image src="https://placehold.co/200x150.png" alt="No requests" width={200} height={150} className="mx-auto mb-4 rounded-md" data-ai-hint="happy empty inbox" />
              <p className="text-muted-foreground text-sm sm:text-base">No new friend requests 🎉</p>
              <Button asChild variant="link" className="mt-2">
                <Link href="/">Go Home</Link>
              </Button>
            </div>
          ) : (
            <ScrollArea className="h-[300px] sm:h-[400px] pr-2 sm:pr-3">
              <ul className="space-y-3 sm:space-y-4">
                {requests.map((r) => (
                  <li key={r.uid} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0 p-2 sm:p-3 border rounded-md hover:bg-muted/50">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <Avatar className="h-9 w-9 sm:h-10 sm:w-10">
                        <AvatarImage src={r.photoURL || undefined} alt={r.name} />
                        <AvatarFallback className="text-sm">{r.name[0]}</AvatarFallback>
                      </Avatar>
                      <Link
                        href={`/profile/${r.uid}`}
                        className="font-medium hover:underline text-sm sm:text-base"
                      >
                        {r.name}
                      </Link>
                    </div>

                    <div className="flex gap-2 w-full sm:w-auto justify-end sm:justify-normal mt-2 sm:mt-0">
                      <Button size="sm" variant="outline" onClick={() => handle(r.uid, false)} className="flex-1 sm:flex-none">
                        <X className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-destructive mr-1 sm:mr-0" /> <span className="sm:hidden">Reject</span>
                      </Button>
                      <Button size="sm" onClick={() => handle(r.uid, true)} className="flex-1 sm:flex-none">
                        <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-0" /> <span className="sm:hidden">Accept</span>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
