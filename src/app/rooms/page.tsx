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
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore"
import { PlusCircle, SearchIcon, UsersIcon } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

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
  const [roomRating, setRoomRating] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!user) return
    setIsLoadingRooms(true)

    const roomsQuery = query(
      collection(db, "rooms"),
      where("memberIds", "array-contains", user.uid)
    )

    const unsubscribe = onSnapshot(
      roomsQuery,
      async snapshot => {
        let list: Room[] = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
        list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))

        const missingCreators = Array.from(new Set(
          list.filter(r => !r.creatorName).map(r => r.creator!)
        ))
        const creatorNameMap: Record<string, string> = {}
        await Promise.all(
          missingCreators.map(async uid => {
            const snap = await getDoc(doc(db, "users", uid))
            if (snap.exists()) creatorNameMap[uid] = (snap.data() as any).name || "Unknown"
          })
        )
        list = list.map(r =>
          !r.creatorName && r.creator && creatorNameMap[r.creator]
            ? { ...r, creatorName: creatorNameMap[r.creator] }
            : r
        )

        const ratingMap: Record<string, number> = {}
        list.forEach(r => {
          const me = r.members.find(m => m.userId === user.uid)
          ratingMap[r.id] = me?.rating ?? 0
        })

        setRooms(list)
        setRoomRating(ratingMap)
        setIsLoadingRooms(false)
      },
      err => {
        console.error("rooms onSnapshot error:", err)
        setIsLoadingRooms(false)
      }
    )
    return () => unsubscribe()
  }, [user])

  const loadMyCounts = useCallback(async () => {
    if (!user || !rooms.length) return
    const res: Record<string, number> = {}
    await Promise.all(
      rooms.map(async r => {
        const [s1, s2] = await Promise.all([
          getDocs(query(
            collection(db, "matches"),
            where("roomId", "==", r.id),
            where("player1Id", "==", user.uid)
          )),
          getDocs(query(
            collection(db, "matches"),
            where("roomId", "==", r.id),
            where("player2Id", "==", user.uid)
          ))
        ])
        res[r.id] = s1.size + s2.size
      })
    )
    setMyMatches(res)
  }, [rooms, user])
  useEffect(() => { loadMyCounts() }, [loadMyCounts])

  // C: загружаем друзей для создания комнаты
  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(
      doc(db, "users", user.uid),
      async snap => {
        if (!snap.exists()) return setFriends([])
        const ids = (snap.data() as UserProfile).friends ?? []
        const loaded = await Promise.all(
          ids.map(async id => ({ uid: id, ...(await getUserLite(id)) }))
        )
        setFriends(loaded)
      }
    )
    return () => unsub()
  }, [user])

  // D: создание новой комнаты
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
      const now = getFinnishFormattedDate()
      const initialMembers = [
        {
          userId: user.uid,
          name: userProfile?.name ?? userProfile?.displayName ?? "",
          email: userProfile?.email ?? "",
          rating: 1000, wins: 0, losses: 0, date: now, role: "admin",
        },
        ...selectedFriends.map(uid => {
          const f = friends.find(x => x.uid === uid)!
          return {
            userId: uid,
            name: f.name ?? f.displayName ?? "",
            email: f.email ?? "",
            rating: 1000, wins: 0, losses: 0, date: now, role: "editor",
          }
        })
      ]
      const ref = await addDoc(collection(db, "rooms"), {
        name: roomName.trim(),
        creator: user.uid,
        creatorName: userProfile?.name ?? userProfile?.displayName ?? "",
        createdAt: now,
        members: initialMembers,
        memberIds: [user.uid, ...selectedFriends],
      })
      // обновляем users.rooms
      await updateDoc(doc(db, "users", user.uid), { rooms: arrayUnion(ref.id) })
      await Promise.all(
        selectedFriends.map(uid =>
          updateDoc(doc(db, "users", uid), { rooms: arrayUnion(ref.id) })
        )
      )
      toast({ title: "Success", description: `Room "${roomName}" created` })
      setRoomName(""); setSelectedFriends([])
    } catch (err) {
      console.error(err)
      toast({ title: "Error", description: "Failed to create room", variant: "destructive" })
    } finally {
      setIsCreatingRoom(false)
    }
  }

  // E: фильтрация по поиску
  const filtered = useMemo(() =>
    rooms.filter(r =>
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.creatorName ?? "").toLowerCase().includes(searchTerm.toLowerCase())
    ), [rooms, searchTerm]
  )

  return (
    <ProtectedRoute>
      <div className="container mx-auto py-8 px-4">
        {/* Заголовок и диалог создания */}
        <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
          <h1 className="text-4xl font-bold flex items-center gap-2">
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
                <DialogDescription>Give your room a name and invite friends.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="roomName" className="text-right">Name</Label>
                  <Input
                    id="roomName"
                    value={roomName}
                    onChange={e => setRoomName(e.target.value)}
                    className="col-span-3"
                    placeholder="Office Ping Pong Champs"
                  />
                </div>
                <p className="text-sm font-medium">Invite friends now:</p>
                <ScrollArea className="h-40 pr-2">
                  {friends.length ? friends.map(f => (
                    <label key={f.uid} className="flex items-center gap-2 py-1">
                      <Checkbox
                        checked={selectedFriends.includes(f.uid)}
                        onCheckedChange={v =>
                          v
                            ? setSelectedFriends([...selectedFriends, f.uid])
                            : setSelectedFriends(selectedFriends.filter(id => id !== f.uid))
                        }
                      />
                      <span>{f.name ?? f.displayName}</span>
                    </label>
                  )) : (
                    <p className="text-muted-foreground">No friends yet</p>
                  )}
                </ScrollArea>
              </div>
              <DialogFooter>
                <Button onClick={handleCreateRoom} disabled={isCreatingRoom}>
                  {isCreatingRoom ? "Creating…" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Список комнат */}
        <Card className="mb-8 shadow-lg">
          <CardHeader>
            <CardTitle>Your Rooms</CardTitle>
            <CardDescription>Click to enter and record matches</CardDescription>
            <div className="relative mt-4">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search by name or creator…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
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
                  {filtered
                    .slice()
                    .reverse()
                    .map((r) => (
                      <Card key={r.id} className="hover:shadow-md transition-shadow">
                        <CardHeader>
                          <CardTitle className="truncate">{r.name}</CardTitle>
                          <CardDescription>Created by: {r.creatorName}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">
                            Members: {r.members.length}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Matches played: {myMatches[r.id] ?? "–"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Your rating: {roomRating[r.id] ?? "–"}
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
      </div>
    </ProtectedRoute>
  )
}