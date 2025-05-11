"use client"

import AchievementsPanel from "@/components/AchievementsPanel"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ScrollArea,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui"
import { useAuth } from "@/contexts/AuthContext"
import { useToast } from "@/hooks/use-toast"
import { db } from "@/lib/firebase"
import * as Friends from "@/lib/friends"
import type { Match } from "@/lib/types"
import { Slider } from "@radix-ui/react-slider"
import { format, parse } from "date-fns"
import {
  collection,
  doc,
  getDocs,
  query,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore"
import {
  getDownloadURL,
  getStorage,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage"
import {
  Activity,
  Camera,
  Check,
  CornerUpLeft,
  CornerUpRight,
  Flame,
  LineChart as LineChartIcon,
  ListOrdered,
  Medal,
  Percent,
  PieChart as PieChartIcon,
  TrendingUp,
  X,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Cropper from "react-easy-crop"
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip as RechartTooltip,
  Legend as ReLegend,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"

const parseDate = (d: string | Timestamp) =>
  typeof d === "string"
    ? parse(d, "dd.MM.yyyy HH.mm.ss", new Date())
    : d.toDate()

const getRank = (elo: number) =>
  elo < 1001
    ? "Ping-Pong Padawan"
    : elo < 1100
      ? "Table-Tennis Trainee"
      : elo < 1200
        ? "Racket Rookie"
        : elo < 1400
          ? "Paddle Prodigy"
          : elo < 1800
            ? "Spin Sensei"
            : elo < 2000
              ? "Smash Samurai"
              : "Ping-Pong Paladin"

const medalMap: Record<string, string> = {
  "Ping-Pong Padawan": "/img/ping-pong-padawan.png",
  "Table-Tennis Trainee": "/img/table-tennis-trainee.png",
  "Racket Rookie": "/img/racket-rookie.png",
  "Paddle Prodigy": "/img/paddle-prodigy.png",
  "Spin Sensei": "/img/spin-sensei.png",
  "Smash Samurai": "/img/smash-samurai.png",
  "Ping-Pong Paladin": "/img/ping-pong-paladin.png",
}

function computeStats(list: Match[], uid: string) {
  let wins = 0,
    losses = 0,
    best = -Infinity,
    worst = Infinity,
    scored = 0,
    conceded = 0,
    curW = 0,
    curL = 0,
    maxW = 0,
    maxL = 0

  list.forEach(m => {
    const p1 = m.player1Id === uid
    const me = p1 ? m.player1 : m.player2
    const opp = p1 ? m.player2 : m.player1
    const win = me.scores > opp.scores
    scored += me.scores
    conceded += opp.scores
    if (win) {
      wins++; curW++; curL = 0
      maxW = Math.max(maxW, curW)
      best = Math.max(best, me.scores - opp.scores)
    } else {
      losses++; curL++; curW = 0
      maxL = Math.max(maxL, curL)
      worst = Math.min(worst, me.scores - opp.scores)
    }
  })

  const total = wins + losses
  return {
    total,
    wins,
    losses,
    winRate: total ? (wins / total) * 100 : 0,
    bestWinMargin: isFinite(best) ? best : 0,
    worstLossMargin: isFinite(worst) ? Math.abs(worst) : 0,
    pointsScored: scored,
    pointsConceded: conceded,
    pointsDiff: scored - conceded,
    maxWinStreak: maxW,
    maxLossStreak: maxL,
  }
}

function computeSideStats(list: Match[], uid: string) {
  let leftSideWins = 0,
    leftSideLosses = 0,
    rightSideWins = 0,
    rightSideLosses = 0,
    leftPointsScored = 0,
    leftPointsConceded = 0,
    rightPointsScored = 0,
    rightPointsConceded = 0

  list.forEach(m => {
    const isPlayer1 = m.player1Id === uid
    const me = isPlayer1 ? m.player1 : m.player2
    const opp = isPlayer1 ? m.player2 : m.player1
    const win = me.scores > opp.scores
    if (me.side === "left") {
      win ? leftSideWins++ : leftSideLosses++
      leftPointsScored += me.scores
      leftPointsConceded += opp.scores
    } else {
      win ? rightSideWins++ : rightSideLosses++
      rightPointsScored += me.scores
      rightPointsConceded += opp.scores
    }
  })

  return {
    leftSideWins,
    leftSideLosses,
    rightSideWins,
    rightSideLosses,
    leftPointsScored,
    leftPointsConceded,
    rightPointsScored,
    rightPointsConceded,
  }
}

export default function ProfilePage() {
  const { user, userProfile, loading } = useAuth()
  const meUid = user?.uid ?? ""
  const { toast } = useToast()

  // file picker & upload
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 1_000_000) {
      return toast({
        title: "Error",
        description: "Please choose an image under 1 MB",
        variant: "destructive",
      })
    }
    try {
      setUploading(true)
      const storage = getStorage()
      const ref = storageRef(storage, `avatars/${meUid}/avatar.jpg`)
      await uploadBytes(ref, file)
      const url = await getDownloadURL(ref)
      await updateDoc(doc(db, "users", meUid), { photoURL: url })
      toast({ title: "Success", description: "Avatar updated" })
      setSelectedFile(null)
    } catch (err) {
      console.error(err)
      toast({
        title: "Error",
        description: "Upload failed",
        variant: "destructive",
      })
    } finally {
      setUploading(false)
    }
  }

  // Stats & matches
  const [matches, setMatches] = useState<Match[]>([])
  const [loadingMatches, setLoadingMatches] = useState(true)
  const [oppFilter, setOppFilter] = useState("all")

  const loadMatches = useCallback(async () => {
    if (!meUid) return
    setLoadingMatches(true)
    const ref = collection(db, "matches")
    const [p1, p2] = await Promise.all([
      getDocs(query(ref, where("player1Id", "==", meUid))),
      getDocs(query(ref, where("player2Id", "==", meUid))),
    ])
    const rows: Match[] = []
    p1.forEach(d => rows.push({ id: d.id, ...(d.data() as any) }))
    p2.forEach(d => rows.push({ id: d.id, ...(d.data() as any) }))
    const uniq = Array.from(new Map(rows.map(r => [r.id, r])).values()).sort(
      (a, b) =>
        parseDate(b.timestamp).getTime() - parseDate(a.timestamp).getTime()
    )
    setMatches(uniq)
    setLoadingMatches(false)
  }, [meUid])

  useEffect(() => {
    loadMatches()
  }, [loadMatches])

  const opponents = useMemo(() => {
    const map = new Map<string, string>()
    matches.forEach(m => {
      const p1 = m.player1Id === meUid
      map.set(
        p1 ? m.player2Id : m.player1Id,
        p1 ? m.player2.name : m.player1.name
      )
    })
    return [...map.entries()].map(([id, name]) => ({ id, name }))
  }, [matches, meUid])

  const filtered = useMemo(
    () =>
      oppFilter === "all"
        ? matches
        : matches.filter(
          m => m.player1Id === oppFilter || m.player2Id === oppFilter
        ),
    [matches, oppFilter]
  )

  const stats = useMemo(() => computeStats(filtered, meUid), [
    filtered,
    meUid,
  ])
  const sideStats = useMemo(() => computeSideStats(filtered, meUid), [
    filtered,
    meUid,
  ])

  const perfData = filtered.length
    ? filtered
      .slice()
      .sort(
        (a, b) => parseDate(a.timestamp).getTime() - parseDate(b.timestamp).getTime()
      )
      .map(m => {
        const p1 = m.player1Id === meUid
        const win = p1
          ? m.player1.scores > m.player2.scores
          : m.player2.scores > m.player1.scores
        return {
          label: format(parseDate(m.timestamp), "dd.MM.yy"),
          result: win ? 1 : -1,
          diff: p1
            ? m.player1.scores - m.player2.scores
            : m.player2.scores - m.player1.scores,
          rating: p1 ? m.player1.newRating : m.player2.newRating,
        }
      })
    : [{ label: "", result: 0, diff: 0, rating: userProfile?.rating || 0 }]

  const pieData = [
    { name: "Wins", value: stats.wins, fill: "hsl(var(--accent))" },
    { name: "Losses", value: stats.losses, fill: "hsl(var(--destructive))" },
  ]
  const sidePieData = [
    { name: "Left Wins", value: sideStats.leftSideWins, fill: "hsl(var(--accent))" },
    { name: "Right Wins", value: sideStats.rightSideWins, fill: "hsl(var(--primary))" },
  ]

  if (loading || !userProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-16 w-16 rounded-full border-b-4 border-primary" />
      </div>
    )
  }

  const rank = getRank(userProfile.maxRating)
  const medalSrc = medalMap[rank]
  const displayName =
    userProfile.displayName ?? userProfile.name ?? "[No Name]"

  return (
    <section className="container mx-auto py-8 space-y-8">
     
      <Card>
        <CardHeader className="flex flex-col md:flex-row md:justify-between items-center gap-6">
          <div className="flex items-center gap-6">
            <div className="relative">
              <Avatar className="h-32 w-32">
                <AvatarImage
                  src={userProfile.photoURL || undefined}
                  className="object-cover"
                />
                <AvatarFallback className="text-4xl">
                  {displayName.charAt(0)}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => inputRef.current?.click()}
                className="absolute bottom-0 right-0 bg-white rounded-full p-1 shadow hover:bg-gray-100"
                aria-label="Change avatar"
                disabled={uploading}
              >
                <Camera className="h-5 w-5 text-primary" />
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
                disabled={uploading}
              />
            </div>
            <div className="text-left space-y-1">
              <CardTitle className="text-4xl">{displayName}</CardTitle>
              <CardDescription>{userProfile.email}</CardDescription>
              <div className="inline-flex items-center gap-2 rounded-md bg-muted py-1 px-2 text-sm">
                <span className="font-medium">{rank}</span>
              </div>
            </div>
          </div>
          {medalSrc && (
            <img
              src={medalSrc}
              alt={rank}
              className="h-[140px] w-[140px] rounded-md"
            />
          )}
        </CardHeader>
      </Card>

      {/* Achievements + Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard icon={LineChartIcon} label="Current ELO" value={userProfile.globalElo} />
        <StatCard icon={ListOrdered} label="Matches" value={stats.total} />
        <StatCard icon={Percent} label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} />
        <StatCard icon={Flame} label="Max Streak" value={stats.maxWinStreak} />
      </div>

      <AchievementsPanel
        achievements={userProfile.achievements ?? []}
        overallMatches={stats.total}
        overallWins={stats.wins}
        overallMaxStreak={stats.maxWinStreak}
      />

      {/* Friends */}
      {userProfile.friends?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Friends</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            {userProfile.friends.map(fid => (
              <FriendChip key={fid} uid={fid} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Filter + Detailed Stats */}
      <div className="flex items-center gap-4">
        <span className="font-medium">Filter by Opponent:</span>
        <Select value={oppFilter} onValueChange={setOppFilter}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="All Opponents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Opponents</SelectItem>
            {opponents.map(o => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DetailedStatsCard stats={stats} side={sideStats} />

      {/* Charts */}
      <div className="space-y-8">
        <ChartCard title="ELO History" icon={LineChartIcon}>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={perfData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis domain={["dataMin-20", "dataMax+20"]} />
              <RechartTooltip
                contentStyle={{ backgroundColor: "#fff", borderRadius: 4 }}
                formatter={(v, n, { payload }) => [`${n}: ${v}`, `Date: ${payload.label}`]}
              />
              <ReLegend />
              <Line type="monotone" dataKey="rating" dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Brush dataKey="label" height={20} travellerWidth={10} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PieCard title="Win / Loss" icon={PieChartIcon} data={pieData}>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label />
                <ReLegend />
              </PieChart>
            </ResponsiveContainer>
          </PieCard>

          <PieCard title="Left vs Right Wins" icon={PieChartIcon} data={sidePieData}>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={sidePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label />
                <ReLegend />
              </PieChart>
            </ResponsiveContainer>
          </PieCard>
        </div>

        <ChartCard title="Match Result" icon={Activity}>
          <ResponsiveContainer width="100%" height={450}>
            <LineChart data={perfData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis domain={[-1.2, 1.2]} ticks={[-1, 0, 1]} />
              <RechartTooltip
                contentStyle={{ backgroundColor: "#fff", borderRadius: 4 }}
                formatter={(v, n) => [`${n}: ${v > 0 ? "Win" : "Loss"}`]}
              />
              <ReLegend />
              <Line type="stepAfter" dataKey="result" dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Brush dataKey="label" height={20} travellerWidth={10} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Score Difference" icon={TrendingUp}>
          <ResponsiveContainer width="100%" height={450}>
            <LineChart data={perfData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis />
              <RechartTooltip
                contentStyle={{ backgroundColor: "#fff", borderRadius: 4 }}
                formatter={(v, n) => [`${n}: ${v}`, ``]}
              />
              <ReLegend />
              <Line type="monotone" dataKey="diff" dot={{ r: 4 }} activeDot={{ r: 6 }} />
              <Brush dataKey="label" height={20} travellerWidth={10} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <MatchesTableCard
        title={`All Matches (${filtered.length})`}
        matches={filtered}
        loading={loadingMatches}
        meUid={meUid}
      />
    </section>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <Icon className="h-6 w-6 text-primary" />
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function ChartCard({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function PieCard({ title, icon: Icon, data, children }: { title: string; icon: any; data: { name: string; value: number; fill: string }[]; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function DetailedStatsCard({ stats, side }: { stats: ReturnType<typeof computeStats>; side: ReturnType<typeof computeSideStats> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CornerUpLeft /> / <CornerUpRight /> Detailed Statistics
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 text-sm">
        <Stat l="Matches" v={stats.total} />
        <Stat l="Wins / Losses" v={`${stats.wins} / ${stats.losses}`} />
        <Stat l="Win Rate" v={`${stats.winRate.toFixed(2)}%`} />
        <Stat l="Best Win Margin" v={stats.bestWinMargin} />
        <Stat l="Worst Loss Margin" v={stats.worstLossMargin} />
        <Stat l="Points Scored" v={stats.pointsScored} />
        <Stat l="Points Conceded" v={stats.pointsConceded} />
        <Stat l="Point Diff" v={stats.pointsDiff} />
        <Stat l="Max Win Streak" v={stats.maxWinStreak} />
        <Stat l="Max Loss Streak" v={stats.maxLossStreak} />
        <Stat l="Left Side Wins" v={side.leftSideWins} />
        <Stat l="Left Side Losses" v={side.leftSideLosses} />
        <Stat l="Right Side Wins" v={side.rightSideWins} />
        <Stat l="Right Side Losses" v={side.rightSideLosses} />
      </CardContent>
    </Card>
  )
}

const Stat = ({ l, v }: { l: string; v: React.ReactNode }) => (
  <div>
    <p className="font-semibold">{l}</p>
    {v}
  </div>
)

function MatchesTableCard({ title, matches, loading, meUid }: { title: string; matches: Match[]; loading: boolean; meUid: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8">Loading…</div>
        ) : matches.length === 0 ? (
          <p className="text-center py-8">No matches found.</p>
        ) : (
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Opponent</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>ELO Δ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {matches.map(m => {
                  const isP1 = m.player1Id === meUid
                  const date = typeof m.timestamp === "string" ? m.timestamp : format(m.playedAt.toDate(), "dd.MM.yyyy HH:mm")
                  const opp = isP1 ? m.player2.name : m.player1.name
                  const myScore = isP1 ? m.player1.scores : m.player2.scores
                  const theirScore = isP1 ? m.player2.scores : m.player1.scores
                  const eloΔ = isP1 ? m.player1.addedPoints : m.player2.addedPoints
                  const win = myScore > theirScore
                  return (
                    <TableRow key={m.id}>
                      <TableCell>{date}</TableCell>
                      <TableCell>{opp}</TableCell>
                      <TableCell>{myScore} – {theirScore}</TableCell>
                      <TableCell className={win ? "text-accent" : "text-destructive"}>{win ? "Win" : "Loss"}</TableCell>
                      <TableCell className={eloΔ >= 0 ? "text-accent" : "text-destructive"}>{eloΔ > 0 ? `+${eloΔ}` : eloΔ}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

function FriendChip({ uid }: { uid: string }) {
  const [info, setInfo] = useState<{ name?: string; photoURL?: string } | null>(null)
  useEffect(() => { Friends.getUserLite(uid).then(setInfo) }, [uid])
  if (!info?.name) return null
  return (
    <Link href={`/profile/${uid}`} className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-muted hover:bg-muted/70">
      <Avatar className="h-6 w-6">
        {info.photoURL ? <AvatarImage src={info.photoURL} /> : <AvatarFallback>{info.name.charAt(0)}</AvatarFallback>}
      </Avatar>
      <span className="text-sm">{info.name}</span>
    </Link>
  )
}
function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.addEventListener("load", () => res(img))
    img.addEventListener("error", (e) => rej(e))
    img.src = url
  })
}