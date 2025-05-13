"use client"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import React from "react"
import { FaLock, FaMedal, FaTrophy } from "react-icons/fa"
import { GiFlame, GiPingPongBat } from "react-icons/gi"

interface Achievement {
  type: string
  dateFinished: string
  place?: number
  matchesPlayed?: number
  wins?: number
  roomName?: string
  description?: string
}

interface Props {
  achievements: Achievement[]
  overallMatches: number
  overallWins: number
  overallMaxStreak: number
}

// теперь в 2× больше порогов
const OVERALL_MATCH_THRESHOLDS = [10, 20, 50, 100, 200, 500, 1000, 2000, 3000, 5000]
const OVERALL_WIN_THRESHOLDS = [10, 20, 50, 100, 200, 500, 1000, 2000, 3000, 5000]
const OVERALL_STREAK_THRESHOLDS = [5, 10, 15, 20, 25, 30, 50, 75, 100]

const SEASON_MATCH_THRESHOLDS = [5, 10, 20, 50, 100, 200, 300]
const SEASON_WIN_THRESHOLDS = [5, 10, 20, 40, 60, 80, 100, 150, 200]
const TOURNAMENT_THRESHOLDS = [1, 5, 10, 25, 50, 100, 200, 500]

const countSeasonsAtOrAbove = (
  arr: Achievement[],
  prop: "matchesPlayed" | "wins",
  thr: number
) =>
  arr.filter(a => a.type === "seasonFinish" && (a[prop] ?? 0) >= thr).length

const datesForPlace = (
  arr: Achievement[],
  place: number,
  type: string
) =>
  arr
    .filter(a => a.type === type && a.place === place)
    .map(a => a.dateFinished)

const tournamentCount = (arr: Achievement[]) =>
  arr.filter(a => a.type === "tournamentFinish").length

export default function AchievementsPanel({
  achievements = [],
  overallMatches = 0,
  overallWins = 0,
  overallMaxStreak = 0,
}: Props) {
  // если нет ни одного сезона — заглушка
  if (!achievements.some(a => a.type === "seasonFinish")) {
    return (
      <Card>
        <CardHeader><CardTitle>Achievements</CardTitle></CardHeader>
        <CardContent>No season achievements yet.</CardContent>
      </Card>
    )
  }

  // подготовка данных
  const seasonStars = [1, 2, 3].map(pl => {
    const cnt = datesForPlace(achievements, pl, "seasonFinish").length
    return {
      label: `Season Podium #${pl}`,
      icon: <FaMedal color={["#ffd700", "#c0c0c0", "#cd7f32"][pl - 1]} />,
      unlocked: cnt > 0,
      count: cnt,
      tooltip: cnt
        ? `Podium #${pl} on:\n${datesForPlace(achievements, pl, "seasonFinish").join("\n")}`
        : `Reach podium #${pl} in a season`,
    }
  })

  const tournStars = [1, 2, 3].map(pl => {
    const cnt = datesForPlace(achievements, pl, "tournamentFinish").length
    return {
      label: `Tournament Podium #${pl}`,
      icon: <FaTrophy color={["#ffd700", "#c0c0c0", "#cd7f32"][pl - 1]} />,
      unlocked: cnt > 0,
      count: cnt,
      tooltip: cnt
        ? `Podium #${pl} on:\n${datesForPlace(achievements, pl, "tournamentFinish").join("\n")}`
        : `Reach tournament podium #${pl}`,
    }
  })

  const tPlayed = tournamentCount(achievements)
  const tournamentMilestones = TOURNAMENT_THRESHOLDS.map(thr => ({
    label: `Played ${thr}+ Tournaments`,
    icon: <FaTrophy />,
    unlocked: tPlayed >= thr,
    tooltip: tPlayed >= thr
      ? `You played ${tPlayed} tournaments (>= ${thr})`
      : `Play ${thr} tournaments to unlock`,
  }))

  const overallMatchMilestones = OVERALL_MATCH_THRESHOLDS.map(thr => ({
    label: `Played ${thr}+ Matches`,
    icon: <GiPingPongBat />,
    unlocked: overallMatches >= thr,
    tooltip: overallMatches >= thr
      ? `You played ${overallMatches} matches (>= ${thr})`
      : `Play ${thr} matches to unlock`,
  }))

  const overallWinMilestones = OVERALL_WIN_THRESHOLDS.map(thr => ({
    label: `Won ${thr}+ Matches`,
    icon: <FaTrophy />,
    unlocked: overallWins >= thr,
    tooltip: overallWins >= thr
      ? `You have ${overallWins} wins (>= ${thr})`
      : `Win ${thr} matches to unlock`,
  }))

  const overallStreakMilestones = OVERALL_STREAK_THRESHOLDS.map(thr => ({
    label: `Win Streak ${thr}+`,
    icon: <GiFlame />,
    unlocked: overallMaxStreak >= thr,
    tooltip: overallMaxStreak >= thr
      ? `Your best streak is ${overallMaxStreak} (>= ${thr})`
      : `Get a streak of ${thr} to unlock`,
  }))

  const seasonMatchMilestones = SEASON_MATCH_THRESHOLDS.map(thr => {
    const cnt = countSeasonsAtOrAbove(achievements, "matchesPlayed", thr)
    return {
      label: `Played ${thr}+ Matches in Season`,
      icon: <GiPingPongBat />,
      unlocked: cnt > 0,
      count: cnt,
      tooltip: cnt
        ? `Achieved in ${cnt} season(s)`
        : `No season with ${thr} matches yet`,
    }
  })

  const seasonWinMilestones = SEASON_WIN_THRESHOLDS.map(thr => {
    const cnt = countSeasonsAtOrAbove(achievements, "wins", thr)
    return {
      label: `Won ${thr}+ Matches in Season`,
      icon: <FaTrophy />,
      unlocked: cnt > 0,
      count: cnt,
      tooltip: cnt
        ? `Achieved in ${cnt} season(s)`
        : `No season with ${thr} wins yet`,
    }
  })

  // Рендер строки
  const Row: React.FC<{ title: string; items: any[] }> = ({ title, items }) => (
    <div className="mb-6">
      <h4 className="text-lg font-semibold mb-2">{title}</h4>
      <div className="flex flex-wrap gap-4 items-center">
        {items.map((it, idx) => (
          <TooltipProvider key={idx}>
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <div
                  className="relative text-3xl"
                  style={{ color: it.unlocked ? undefined : "#ccc" }}
                >
                  {it.icon}
                  {/* бейджик только когда count>0 */}
                  {it.count! > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full text-xs w-5 h-5 flex items-center justify-center">
                      {it.count}
                    </span>
                  )}
                  {!it.unlocked && (
                    <FaLock className="absolute -top-2 -right-2 text-lg text-gray-500" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <div style={{ whiteSpace: "pre-wrap" }}>{it.tooltip}</div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>
    </div>
  )

  return (
    <Card className="h-full">
      <CardHeader><CardTitle>Achievements</CardTitle></CardHeader>
      <CardContent>
        <Row title="Season Podiums" items={seasonStars} />
        <Row title="Tournament Podiums" items={tournStars} />
        <Row title="Tournaments Played" items={tournamentMilestones} />
        <Row title="Total Matches" items={overallMatchMilestones} />
        <Row title="Total Wins" items={overallWinMilestones} />
        <Row title="Longest Win Streak" items={overallStreakMilestones} />
        <Row title="Matches in a Single Season" items={seasonMatchMilestones} />
        <Row title="Wins in a Single Season" items={seasonWinMilestones} />
      </CardContent>
    </Card>
  )
}