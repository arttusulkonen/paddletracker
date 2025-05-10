"use client"

import { ProtectedRoute } from "@/components/ProtectedRoutes"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/contexts/AuthContext"
import { useToast } from "@/hooks/use-toast"
import { db } from "@/lib/firebase"
import { getUserLite } from "@/lib/friends"
import type { Room, UserProfile } from "@/lib/types"
import { getFinnishFormattedDate } from "@/lib/utils"
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore"
import { PlusCircle, SearchIcon, UsersIcon } from "lucide-react"
import NextImage from "next/image"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"

export default function RoomsPage() {
  const { user, userProfile } = useAuth()
  const { toast } = useToast()

  const [roomName, setRoomName] = useState("")
  const [isCreatingRoom, setIsCreatingRoom] = useState(false)

  const [rooms, setRooms] = useState<Room[]>([])
  const [isLoadingRooms, setIsLoadingRooms] = useState(true)

  const [searchTerm, setSearchTerm] = useState("")
  const [friends, setFriends] = useState<UserProfile[]>([])
  const [selectedFriends, setSelectedFriends] = useState<string[]>([])
  const [myMatches, setMyMatches] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!user) return
    setIsLoadingRooms(true)

    const qRooms = query(
      collection(db, "rooms"),
      where("memberIds", "array-contains", user.uid)
    )

    const unsub = onSnapshot(
      qRooms,
      async (snap) => {
        const list: Room[] = []
        for (const d of snap.docs) {
          const data = d.data() as any
          if (data.creator && !data.creatorName) {
            const uSnap = await getDoc(doc(db, "users", data.creator))
            if (uSnap.exists()) data.creatorName = (uSnap.data() as UserProfile).name
          }
          list.push({ id: d.id, ...data })
        }

        setRooms(
          list.sort((a, b) => {
            const ca = (a.createdAt as string | undefined) ?? ""
            const cb = (b.createdAt as string | undefined) ?? ""
            return cb.localeCompare(ca)
          })
        )
        setIsLoadingRooms(false)
      },
      () => setIsLoadingRooms(false)
    )

    return () => unsub()
  }, [user])

  const loadMyCounts = useCallback(async () => {
    if (!user || !rooms.length) return
    const res: Record<string, number> = {}
    await Promise.all(
      rooms.map(async (r) => {
        const q1 = query(
          collection(db, "matches"),
          where("roomId", "==", r.id),
          where("player1Id", "==", user.uid)
        )
        const q2 = query(
          collection(db, "matches"),
          where("roomId", "==", r.id),
          where("player2Id", "==", user.uid)
        )
        const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)])
        res[r.id] = s1.size + s2.size
      })
    )
    setMyMatches(res)
  }, [rooms, user])

  useEffect(() => { loadMyCounts() }, [loadMyCounts])

  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(doc(db, "users", user.uid), async (snap) => {
      if (!snap.exists()) return setFriends([])
      const ids = (snap.data() as UserProfile).friends ?? []
      const loaded = await Promise.all(
        ids.map(async (id) => ({ uid: id, ...(await getUserLite(id)) } as UserProfile))
      )
      setFriends(loaded)
    })
    return () => unsub()
  }, [user])

  const handleCreateRoom = async () => {
    if (!user) {
      toast({ title: "Error", description: "Log in to create a room", variant: "destructive" })
      return
    }
    if (!roomName.trim()) {
      toast({ title: "Error", description: "Room name cannot be empty", variant: "destructive" })
      return
    }
    setIsCreatingRoom(true)
    try {
      const ref = await addDoc(collection(db, "rooms"), {
        name: roomName.trim(),
        creator: user.uid,
        creatorName: userProfile?.name ?? "",
        createdAt: getFinnishFormattedDate(),
        seasonHistory: [],
        members: [
          {
            userId: user.uid,
            name: userProfile?.name ?? "",
            email: userProfile?.email ?? "",
            rating: 1000,
            maxRating: 1000,
            wins: 0,
            losses: 0,
            roomCreated: getFinnishFormattedDate(),
            role: "admin",
          },
        ],
        memberIds: [user.uid],
      })
      await updateDoc(doc(db, "users", user.uid), { rooms: arrayUnion(ref.id) })
      toast({ title: "Success", description: `Room «${roomName}» created` })
      setRoomName("")
    } catch {
      toast({ title: "Error", description: "Failed to create room", variant: "destructive" })
    } finally {
      setIsCreatingRoom(false)
    }
  }

  const filtered = rooms.filter(
    (r) =>
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.creatorName ?? "").toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <ProtectedRoute>
      <div className="container mx-auto py-8 px-4">
        <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
          <h1 className="text-4xl font-bold tracking-tight flex items-center gap-2">
            <UsersIcon className="h-10 w-10 text-primary" /> Match Rooms
          </h1>

          <Dialog>
            <DialogTrigger asChild>
              <Button size="lg">
                <PlusCircle className="mr-2 h-5 w-5" /> Create New Room
              </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create a Match Room</DialogTitle>
                <DialogDescription>
                  Give your room a name and invite friends.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="roomName" className="text-right">
                    Name
                  </Label>
                  <Input
                    id="roomName"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    className="col-span-3"
                    placeholder="Office Ping Pong Champs"
                  />

                  <Separator />

                  <p className="text-sm font-medium">Invite friends now:</p>
                  <ScrollArea className="h-40 pr-2">
                    {friends.length ? (
                      friends.map((f) => (
                        <label key={f.uid} className="flex items-center gap-2 py-1">
                          <Checkbox
                            checked={selectedFriends.includes(f.uid)}
                            onCheckedChange={(v) =>
                              setSelectedFriends((prev) =>
                                v ? [...prev, f.uid] : prev.filter((id) => id !== f.uid)
                              )
                            }
                          />
                          <span>{f.name}</span>
                        </label>
                      ))
                    ) : (
                      <p className="text-muted-foreground">No friends yet</p>
                    )}
                  </ScrollArea>
                </div>
              </div>

              <DialogFooter>
                <Button onClick={handleCreateRoom} disabled={isCreatingRoom}>
                  {isCreatingRoom ? "Creating…" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="mb-8 shadow-lg">
          <CardHeader>
            <CardTitle>Your Rooms</CardTitle>
            <CardDescription>Click to enter and record matches</CardDescription>

            <div className="relative mt-4">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search by name or creator…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full max-w-md"
              />
            </div>
          </CardHeader>

          <CardContent>
            {isLoadingRooms ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin h-12 w-12 rounded-full border-b-2 border-primary" />
              </div>
            ) : filtered.length ? (
              <ScrollArea className="h-[400px]">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-1">
                  {filtered.map((r) => (
                    <Card key={r.id} className="hover:shadow-md transition-shadow">
                      <CardHeader>
                        <CardTitle className="truncate">{r.name}</CardTitle>
                        <CardDescription>
                          Created by: {r.creatorName ?? "Unknown"}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          Members: {r.members.length}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Your rating:{" "}
                          {r.members.find((m) => m.userId === user!.uid)?.rating ?? "–"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Matches played: {myMatches[r.id] ?? "–"}
                        </p>
                      </CardContent>
                      <CardFooter>
                        <Button asChild className="w-full">
                          <Link href={`/rooms/${r.id}`}>Enter Room</Link>
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                {searchTerm
                  ? "No rooms match your search"
                  : "You are not a member of any rooms yet"}
              </p>
            )}
          </CardContent>
        </Card>

        <Separator className="my-8" />

        {/* <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Public Rooms</CardTitle>
            <CardDescription>Browse and join rooms — coming soon</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-center text-muted-foreground py-8">
              This section is under construction
            </p>
            <div className="flex justify-center">
              <NextImage
                src="https://picsum.photos/seed/construction/400/200"
                alt="Under construction"
                width={400}
                height={200}
                className="rounded-md"
              />
            </div>
          </CardContent>
        </Card> */}
      </div>
    </ProtectedRoute>
  )
}