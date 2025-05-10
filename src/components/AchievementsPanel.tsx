"use client"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Flame, Lock, Medal, Trophy } from "lucide-react"

interface Achievement {
  type: string
  dateFinished: string
  place?: number
  matchesPlayed?: number
  wins?: number
}

interface Props {
  achievements: Achievement[]
  overallMatches: number
  overallWins: number
  overallMaxStreak: number
}

const MATCH_THRESHOLDS = [10, 20, 50, 100, 200, 500, 1000]
const WIN_THRESHOLDS = [10, 20, 50, 100, 200, 500]
const STREAK_THRESHOLDS = [5, 10, 15, 20]

const countBy = (arr: Achievement[], prop: "matchesPlayed" | "wins", thr: number) =>
  arr.filter(a => a.type === "seasonFinish" && ((a[prop] || 0) >= thr)).length
const datesFor = (arr: Achievement[], place: number, t: string) =>
  arr.filter(a => a.type === t && a.place === place).map(a => a.dateFinished)
const tournamentCount = (arr: Achievement[]) =>
  arr.filter(a => a.type === "tournamentFinish").length

export default function AchievementsPanel({
  achievements,
  overallMatches,
  overallWins,
  overallMaxStreak,
}: Props) {
  const seasonStars = [1, 2, 3].map(pl => ({
    icon: <Medal color={["#ffd700", "#c0c0c0", "#cd7f32"][pl - 1]} />,
    unlocked: datesFor(achievements, pl, "seasonFinish").length > 0,
    label: `Season podium place ${pl}`
  }))
  const tournStars = [1, 2, 3].map(pl => ({
    icon: <Trophy color={["#ffd700", "#c0c0c0", "#cd7f32"][pl - 1]} />,
    unlocked: datesFor(achievements, pl, "tournamentFinish").length > 0,
    label: `Tournament podium place ${pl}`
  }))
  const tournPlayed = tournamentCount(achievements)
  const tournMilestones = [1, 5, 10, 25].map(thr => ({
    icon: <Trophy />,
    unlocked: tournPlayed >= thr,
    label: `Played ${thr}+ Tournaments`
  }))
  const matchMilestones = MATCH_THRESHOLDS.map(thr => ({
    icon: <Medal />,
    unlocked: overallMatches >= thr,
    label: `Played ${thr}+ Matches`
  }))
  const winMilestones = WIN_THRESHOLDS.map(thr => ({
    icon: <Trophy />,
    unlocked: overallWins >= thr,
    label: `Won ${thr}+ Matches`
  }))
  const streakMilestones = STREAK_THRESHOLDS.map(thr => ({
    icon: <Flame />,
    unlocked: overallMaxStreak >= thr,
    label: `Win streak ${thr}+`
  }))
  const seasonMatchMilestones = [5, 10, 20, 50].map(thr => {
    const c = countBy(achievements, "matchesPlayed", thr)
    return { icon: <Medal />, unlocked: c > 0, label: `${thr}+ Matches in Season` }
  })
  const seasonWinMilestones = [5, 10, 20, 40].map(thr => {
    const c = countBy(achievements, "wins", thr)
    return { icon: <Trophy />, unlocked: c > 0, label: `${thr}+ Wins in Season` }
  })

  const renderRow = (title: string, items: { icon: JSX.Element; unlocked: boolean; label: string; }[]) => (
    <div className="mb-6">
      <h4 className="text-lg font-semibold mb-2 text-muted-foreground">{title}</h4>
      <div className="flex flex-wrap gap-4">
        {items.map((it, i) => (
          <div key={i} className="relative text-3xl" title={it.label} style={{ opacity: it.unlocked ? 1 : 0.3 }}>
            {it.icon}
            {!it.unlocked && <Lock className="absolute -top-2 -right-2 w-4 h-4 text-gray-500" />}
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <Card>
      <CardHeader><CardTitle>Achievements</CardTitle></CardHeader>
      <CardContent>
        {renderRow("Season Podiums", seasonStars)}
        {renderRow("Tournament Podiums", tournStars)}
        {renderRow("Tournaments Played", tournMilestones)}
        {renderRow("Total Matches (Overall)", matchMilestones)}
        {renderRow("Total Wins (Overall)", winMilestones)}
        {renderRow("Longest Win Streak", streakMilestones)}
        {renderRow("Matches in a Season", seasonMatchMilestones)}
        {renderRow("Wins in a Season", seasonWinMilestones)}
      </CardContent>
    </Card>
  )
}