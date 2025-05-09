// src/app/player/[uid]/page.tsx
"use client"

import { useAuth } from "@/contexts/AuthContext"
import { db } from "@/lib/firebase"
import * as Friends from "@/lib/friends"

import AchievementsPanel from "@/components/AchievementsPanel"
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import type { Match, UserProfile } from "@/lib/types"
import { format, parse } from "date-fns"
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  Timestamp,
  where,
} from "firebase/firestore"
import {
  BarChart3,
  CornerUpLeft,
  CornerUpRight,
  Flame,
  LineChart as LineChartIcon,
  ListOrdered,
  Medal,
  Percent,
  PieChart as PieChartIcon,
} from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  Legend as ReLegend,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts"

/* ------------------------------------------------------------------ */
/* helpers ----------------------------------------------------------- */
const dateObj = (d: string | Timestamp) =>
  typeof d === "string"
    ? parse(d, "dd.MM.yyyy HH.mm.ss", new Date())
    : d.toDate()

const rankFor = (elo: number) => {
  if (elo < 1001) return "Ping-Pong Padawan"
  if (elo < 1100) return "Table-Tennis Trainee"
  if (elo < 1200) return "Racket Rookie"
  if (elo < 1400) return "Paddle Prodigy"
  if (elo < 1800) return "Spin Sensei"
  if (elo < 2000) return "Smash Samurai"
  return "Ping-Pong Paladin"
}

/* aggregated statistics */
const calcStats = (list: Match[], uid: string, name?: string) => {
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

  list
    .slice()
    .reverse()
    .forEach((m) => {
      const p1 = m.player1Id === uid
      const me = p1 ? m.player1 : m.player2
      const opp = p1 ? m.player2 : m.player1
      const win = m.winner === name

      scored += me.scores
      conceded += opp.scores

      if (win) {
        wins++
        curW++
        curL = 0
        maxW = Math.max(maxW, curW)
        best = Math.max(best, me.scores - opp.scores)
      } else {
        losses++
        curL++
        curW = 0
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

type SideStats = {
  leftWins: number
  leftLosses: number
  rightWins: number
  rightLosses: number
  leftScored: number
  leftConceded: number
  rightScored: number
  rightConceded: number
}

const calcSideStats = (
  list: Match[],
  uid: string,
  name?: string
): SideStats => {
  const s: SideStats = {
    leftWins: 0,
    leftLosses: 0,
    rightWins: 0,
    rightLosses: 0,
    leftScored: 0,
    leftConceded: 0,
    rightScored: 0,
    rightConceded: 0,
  }
  list.forEach((m) => {
    const p1 = m.player1Id === uid
    const me = p1 ? m.player1 : m.player2
    const opp = p1 ? m.player2 : m.player1
    const win = m.winner === name
    if (me.side === "left") {
      win ? s.leftWins++ : s.leftLosses++
      s.leftScored += me.scores
      s.leftConceded += opp.scores
    } else {
      win ? s.rightWins++ : s.rightLosses++
      s.rightScored += me.scores
      s.rightConceded += opp.scores
    }
  })
  return s
}

/* ------------------------------------------------------------------ */
export default function ProfilePage() {
  const params = useParams<{ uid?: string }>()
  const viewedUid = params?.uid as string | undefined

  const { user, userProfile, loading } = useAuth()
  const [viewedProfile, setViewedProfile] = useState<UserProfile | null>(null)

  /* ---------------------------------------------------------------- */
  /* load correct profile ------------------------------------------- */
  useEffect(() => {
    if (!viewedUid || viewedUid === user?.uid) {
      setViewedProfile(userProfile ?? null)
      return
    }
    getDoc(doc(db, "users", viewedUid)).then((snap) =>
      setViewedProfile(snap.exists() ? (snap.data() as any) : null)
    )
  }, [viewedUid, user?.uid, userProfile])

  /* ---------------------------------------------------------------- */
  /* friendship state ------------------------------------------------ */
  const [friendStatus, setFriendStatus] = useState<
    "self" | "friends" | "out" | "in" | "none"
  >("none")

  useEffect(() => {
    if (!user || !viewedUid || !viewedProfile) return

    if (viewedUid === user.uid) {
      setFriendStatus("self")
      return
    }

    if (viewedProfile.friends?.includes(user.uid)) setFriendStatus("friends")
    else if (viewedProfile.incomingRequests?.includes(user.uid))
      setFriendStatus("out")
    else if (viewedProfile.outgoingRequests?.includes(user.uid))
      setFriendStatus("in")
    else setFriendStatus("none")
  }, [user, viewedUid, viewedProfile])

  /* ---------------------------------------------------------------- */
  /* matches --------------------------------------------------------- */
  const [matches, setMatches] = useState<Match[]>([])
  const [isLoadingMatches, setIsLoadingMatches] = useState(true)
  const [opponent, setOpponent] = useState("all")

  const loadMatches = useCallback(async (uid: string) => {
    setIsLoadingMatches(true)
    const ref = collection(db, "matches")
    const [p1, p2] = await Promise.all([
      getDocs(query(ref, where("player1Id", "==", uid))),
      getDocs(query(ref, where("player2Id", "==", uid))),
    ])
    const raw: Match[] = []
    p1.forEach((d) => raw.push({ id: d.id, ...(d.data() as any) }))
    p2.forEach((d) => raw.push({ id: d.id, ...(d.data() as any) }))

    const uniq = Array.from(new Map(raw.map((m) => [m.id, m])).values()).sort(
      (a, b) =>
        dateObj(b.timestamp ?? b.playedAt).getTime() -
        dateObj(a.timestamp ?? a.playedAt).getTime()
    )
    setMatches(uniq)
    setIsLoadingMatches(false)
  }, [])

  useEffect(() => {
    if (viewedProfile) loadMatches(viewedUid ?? user!.uid)
  }, [viewedProfile, loadMatches, viewedUid, user])

  /* ---------------------------------------------------------------- */
  /* derived data ---------------------------------------------------- */
  const meUid = viewedUid ?? user!.uid

  const opponents = useMemo(() => {
    const m = new Map<string, string>()
    matches.forEach((match) => {
      const p1 = match.player1Id === meUid
      const id = p1 ? match.player2Id : match.player1Id
      const name = p1 ? match.player2.name : match.player1.name
      m.set(id, name)
    })
    return [...m].map(([id, name]) => ({ id, name }))
  }, [matches, meUid])

  const filteredMatches = useMemo(
    () =>
      opponent === "all"
        ? matches
        : matches.filter(
          (m) => m.player1Id === opponent || m.player2Id === opponent
        ),
    [matches, opponent]
  )

  const stats = useMemo(
    () =>
      viewedProfile ? calcStats(filteredMatches, meUid, viewedProfile.name) : null,
    [filteredMatches, viewedProfile, meUid]
  )
  const sideStats = useMemo(
    () =>
      viewedProfile
        ? calcSideStats(filteredMatches, meUid, viewedProfile.name)
        : null,
    [filteredMatches, viewedProfile, meUid]
  )

  const pieData = useMemo(
    () => [
      { name: "Wins", value: stats?.wins ?? 0, fill: "hsl(var(--accent))" },
      {
        name: "Losses",
        value: stats?.losses ?? 0,
        fill: "hsl(var(--destructive))",
      },
    ],
    [stats]
  )

  const eloHistory = useMemo(() => {
    if (!viewedProfile) return []
    const raw =
      viewedProfile.eloHistory?.map((e: any) => ({
        elo: e.elo,
        label: format(dateObj(e.date), "dd.MM HH:mm"),
        t: dateObj(e.date).getTime(),
      })) ?? []
    if (!raw.length)
      raw.push({
        elo: viewedProfile.globalElo ?? 0,
        label: format(new Date(), "dd.MM HH:mm"),
        t: Date.now(),
      })
    return raw.sort((a, b) => a.t - b.t)
  }, [viewedProfile])

  /* ---------------------------------------------------------------- */
  /* guards ---------------------------------------------------------- */
  if (loading || !viewedProfile) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-10rem)]">
        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-primary" />
      </div>
    )
  }

  /* ---------------------------------------------------------------- */
  return (
    <section className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <Card>
        <CardHeader className="flex flex-col md:flex-row items-center gap-6">
          <Avatar className="h-24 w-24">
            <AvatarImage src={viewedProfile.photoURL || undefined} />
            <AvatarFallback className="text-4xl">
              {viewedProfile.name?.[0]}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 text-center md:text-left space-y-1">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="text-4xl">
                  {viewedProfile.name}
                </CardTitle>
                <CardDescription>{viewedProfile.email}</CardDescription>
              </div>

              {friendStatus !== "self" && user && (
                <Button
                  size="sm"
                  variant={friendStatus === "friends" ? "secondary" : "outline"}
                  onClick={async () => {
                    switch (friendStatus) {
                      case "none":
                        await Friends.sendFriendRequest(user.uid, viewedUid!)
                        setFriendStatus("out")
                        break
                      case "out":
                        await Friends.cancelRequest(user.uid, viewedUid!)
                        setFriendStatus("none")
                        break
                      case "in":
                        await Friends.acceptRequest(user.uid, viewedUid!)
                        setFriendStatus("friends")
                        break
                      case "friends":
                        await Friends.unfriend(user.uid, viewedUid!)
                        setFriendStatus("none")
                        break
                    }
                  }}
                >
                  {{
                    none: "Add friend",
                    out: "Cancel request",
                    in: "Accept request",
                    friends: "Unfriend",
                  }[friendStatus]}
                </Button>
              )}
            </div>

            <span className="inline-flex items-center gap-2 rounded-md bg-muted py-1 px-2 text-sm">
              <Medal className="h-4 w-4 text-accent" />
              {rankFor(viewedProfile.globalElo)}
            </span>
          </div>
        </CardHeader>
      </Card>

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          icon={LineChartIcon}
          label="Current ELO"
          value={viewedProfile.globalElo}
        />
        <StatCard
          icon={ListOrdered}
          label="Matches"
          value={stats?.total ?? 0}
        />
        <StatCard
          icon={Percent}
          label="Win Rate"
          value={`${stats ? stats.winRate.toFixed(1) : 0}%`}
        />
        <StatCard
          icon={Flame}
          label="Max Streak"
          value={stats?.maxWinStreak ?? 0}
        />
      </div>

      {/* Achievements & friends */}
      <AchievementsPanel
        achievements={(viewedProfile.achievements ?? []).map((a) => ({
          ...a,
          place: a.place ?? undefined,
        }))}
        overallMatches={stats?.total ?? 0}
        overallWins={stats?.wins ?? 0}
        overallMaxStreak={stats?.maxWinStreak ?? 0}
      />

      {viewedProfile.friends?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Friends</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-4">
            {viewedProfile.friends.map((fid) => (
              <FriendChip key={fid} uid={fid} />
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <ChartCard title="ELO History" icon={LineChartIcon}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={eloHistory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis domain={["dataMin-20", "dataMax+20"]} />
              <ReLegend />
              <Line
                type="monotone"
                dataKey="elo"
                stroke="hsl(var(--primary))"
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <PieCard title="Win / Loss" icon={PieChartIcon} data={pieData} />
      </div>

      {/* Opponent filter */}
      <div className="flex items-center gap-4">
        <p className="font-medium">Filter by Opponent:</p>
        <Select value={opponent} onValueChange={setOpponent}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="All Opponents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Opponents</SelectItem>
            {opponents.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Detailed stats */}
      {stats && (
        <DetailedStatsCard
          stats={stats}
          sideStats={sideStats}
          label={
            opponent === "all"
              ? "Overall Statistics"
              : `Stats vs ${opponents.find((o) => o.id === opponent)?.name}`
          }
        />
      )}

      {/* Recent / all matches */}
      <MatchesTableCard
        title="Recent Matches"
        icon={BarChart3}
        matches={filteredMatches.slice(0, 5)}
        loading={isLoadingMatches}
        meUid={meUid}
      />

      <MatchesTableCard
        title={`All Matches (${filteredMatches.length})`}
        matches={filteredMatches}
        loading={isLoadingMatches}
        maxHeight="28rem"
        meUid={meUid}
      />
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Small reusable components ---------------------------------------- */
function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: any
  label: string
  value: string | number
}) {
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

function ChartCard({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: any
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-64">{children}</CardContent>
    </Card>
  )
}

function PieCard({
  title,
  icon: Icon,
  data,
}: {
  title: string
  icon: any
  data: { name: string; value: number; fill: string }[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={80}
              label
            />
            <ReLegend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function DetailedStatsCard({
  stats,
  sideStats,
  label,
}: {
  stats: ReturnType<typeof calcStats>
  sideStats: ReturnType<typeof calcSideStats> | null
  label: string
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Medal /> {label}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          <StatItem l="Matches Played" v={stats.total} />
          <StatItem l="Wins / Losses" v={`${stats.wins}/${stats.losses}`} />
          <StatItem l="Best Win Margin" v={stats.bestWinMargin} />
          <StatItem l="Worst Loss Margin" v={stats.worstLossMargin} />
          <StatItem l="Points Scored" v={stats.pointsScored} />
          <StatItem l="Points Conceded" v={stats.pointsConceded} />
          <StatItem l="Point Diff" v={stats.pointsDiff} />
          <StatItem l="Longest Win Streak" v={stats.maxWinStreak} />
          <StatItem l="Longest Loss Streak" v={stats.maxLossStreak} />
        </CardContent>
      </Card>

      {sideStats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CornerUpLeft /> / <CornerUpRight /> Side Statistics
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
            <SideBlock
              side="Left"
              wins={sideStats.leftWins}
              losses={sideStats.leftLosses}
              scored={sideStats.leftScored}
              conceded={sideStats.leftConceded}
            />
            <SideBlock
              side="Right"
              wins={sideStats.rightWins}
              losses={sideStats.rightLosses}
              scored={sideStats.rightScored}
              conceded={sideStats.rightConceded}
            />
          </CardContent>
        </Card>
      )}
    </>
  )
}

const StatItem = ({ l, v }: { l: string; v: React.ReactNode }) => (
  <div>
    <p className="font-semibold">{l}</p>
    {v}
  </div>
)

const SideBlock = ({
  side,
  wins,
  losses,
  scored,
  conceded,
}: {
  side: string
  wins: number
  losses: number
  scored: number
  conceded: number
}) => (
  <div>
    <p className="font-semibold mb-1">{side} Side</p>
    <p>Wins: {wins}</p>
    <p>Losses: {losses}</p>
    <p>
      Points: {scored} / {conceded}
    </p>
    <p>Win Ratio: {losses ? (wins / losses).toFixed(2) : wins}</p>
    <p>KD Ratio: {conceded ? (scored / conceded).toFixed(2) : scored}</p>
  </div>
)

function MatchesTableCard({
  title,
  icon: Icon,
  matches,
  loading,
  maxHeight = "18rem",
  meUid,
}: {
  title: string
  icon?: any
  matches: Match[]
  loading: boolean
  maxHeight?: string
  meUid: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {Icon && <Icon />} {title}
        </CardTitle>
        {title === "Recent Matches" && (
          <CardDescription>Last 5 matches</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8">Loading…</div>
        ) : matches.length === 0 ? (
          <p className="text-center py-8">No matches found.</p>
        ) : (
          <ScrollArea className={`max-h-[${maxHeight}]`}>
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
                {matches.map((m) => (
                  <MatchRow key={m.id} match={m} meUid={meUid} />
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

function MatchRow({ match, meUid }: { match: Match; meUid: string }) {
  const meP1 = match.player1Id === meUid
  const date = match.timestamp
    ? match.timestamp
    : format(match.playedAt.toDate(), "dd.MM.yyyy HH:mm")
  const opp = meP1 ? match.player2.name : match.player1.name
  const myScore = meP1 ? match.player1.scores : match.player2.scores
  const theirScore = meP1 ? match.player2.scores : match.player1.scores
  const eloDiff = meP1 ? match.player1.addedPoints : match.player2.addedPoints
  const win =
    match.winner === (meP1 ? match.player1.name : match.player2.name)

  return (
    <TableRow>
      <TableCell>{date}</TableCell>
      <TableCell>{opp}</TableCell>
      <TableCell>
        {myScore} – {theirScore}
      </TableCell>
      <TableCell className={win ? "text-accent" : "text-destructive"}>
        {win ? "Win" : "Loss"}
      </TableCell>
      <TableCell className={eloDiff >= 0 ? "text-accent" : "text-destructive"}>
        {eloDiff > 0 ? `+${eloDiff}` : eloDiff}
      </TableCell>
    </TableRow>
  )
}

/* ------------------------------------------------------------------ */
/* Friend chip ------------------------------------------------------- */
function FriendChip({ uid }: { uid: string }) {
  const [info, setInfo] = useState<{
    name: string
    photoURL?: string
  } | null>(null)
  useEffect(() => {
    Friends.getUserLite(uid).then(setInfo)
  }, [uid])
  if (!info) return null

  return (
    <Link
      href={`/profile/${uid}`}
      className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-muted hover:bg-muted/70"
    >
      <Avatar className="h-6 w-6">
        <AvatarImage src={info.photoURL || undefined} />
        <AvatarFallback>{info.name[0]}</AvatarFallback>
      </Avatar>
      <span className="text-sm">{info.name}</span>
    </Link>
  )
}