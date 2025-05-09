"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Flame, Lock, Medal, Trophy } from "lucide-react";

interface Achievement {
  type: string;
  dateFinished: string;
  place?: number;
  matchesPlayed?: number;
  wins?: number;
}

interface Props {
  achievements: Achievement[];
  overallMatches: number;
  overallWins: number;
  overallMaxStreak: number;
}

const OVERALL_MATCH_THRESHOLDS = [10, 20, 50, 100, 200, 500, 1000];
const OVERALL_WIN_THRESHOLDS = [10, 20, 50, 100, 200, 500];
const OVERALL_STREAK_THRESHOLDS = [5, 10, 15, 20];

const countSeasonsAtOrAbove = (
  arr: Achievement[],
  prop: "matchesPlayed" | "wins",
  thr: number
) =>
  arr.filter((a) => a.type === "seasonFinish" && (a[prop] || 0) >= thr)
    .length;
const datesForPlace = (arr: Achievement[], place: number, type: string) =>
  arr
    .filter((a) => a.type === type && a.place === place)
    .map((a) => a.dateFinished);
const tournamentCount = (arr: Achievement[]) =>
  arr.filter((a) => a.type === "tournamentFinish").length;

export default function AchievementsPanel({
  achievements,
  overallMatches,
  overallWins,
  overallMaxStreak,
}: Props) {
  const hasSeason = achievements.some((a) => a.type === "seasonFinish");
  if (!hasSeason) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Achievements</CardTitle>
        </CardHeader>
        <CardContent>No season achievements yet.</CardContent>
      </Card>
    );
  }

  const renderRow = (
    title: string,
    items: {
      icon: JSX.Element;
      unlocked: boolean;
      label: string;
      count?: number;
    }[]
  ) => (
    <div className="mb-6">
      <h4 className="text-lg font-semibold mb-2 text-muted-foreground">
        {title}
      </h4>
      <div className="flex flex-wrap gap-4">
        {items.map((it, idx) => (
          <div
            key={idx}
            className="relative text-3xl"
            title={it.label}
            style={{ opacity: it.unlocked ? 1 : 0.3 }}
          >
            {it.icon}
            {it.count && it.unlocked && (
              <span className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">
                {it.count}
              </span>
            )}
            {!it.unlocked && (
              <Lock className="absolute -top-2 -right-2 w-4 h-4 text-gray-500" />
            )}
          </div>
        ))}
      </div>
    </div>
  );

  // season podiums
  const seasonStars = [1, 2, 3].map((pl) => ({
    icon: <Medal color={["#ffd700", "#c0c0c0", "#cd7f32"][pl - 1]} />,
    unlocked: datesForPlace(achievements, pl, "seasonFinish").length > 0,
    label: `Season podium place ${pl}`,
    count: datesForPlace(achievements, pl, "seasonFinish").length,
  }));
  // tournament podiums
  const tournStars = [1, 2, 3].map((pl) => ({
    icon: <Trophy color={["#ffd700", "#c0c0c0", "#cd7f32"][pl - 1]} />,
    unlocked: datesForPlace(achievements, pl, "tournamentFinish").length > 0,
    label: `Tournament podium place ${pl}`,
    count: datesForPlace(achievements, pl, "tournamentFinish").length,
  }));
  // tournaments played
  const tPlayed = tournamentCount(achievements);
  const tournamentMilestones = [1, 5, 10, 25].map((thr) => ({
    icon: <Trophy />,
    unlocked: tPlayed >= thr,
    label: `Played ${thr}+ Tournaments`,
  }));
  // overall matches
  const overallMatchMilestones = OVERALL_MATCH_THRESHOLDS.map((thr) => ({
    icon: <Medal />,
    unlocked: overallMatches >= thr,
    label: `Played ${thr}+ Matches`,
  }));
  // overall wins
  const overallWinMilestones = OVERALL_WIN_THRESHOLDS.map((thr) => ({
    icon: <Trophy />,
    unlocked: overallWins >= thr,
    label: `Won ${thr}+ Matches`,
  }));
  // overall streak
  const overallStreakMilestones = OVERALL_STREAK_THRESHOLDS.map((thr) => ({
    icon: <Flame />,
    unlocked: overallMaxStreak >= thr,
    label: `Streak ${thr}+`,
  }));
  // season matches
  const seasonMatchMilestones = [5, 10, 20, 50].map((thr) => {
    const cnt = countSeasonsAtOrAbove(achievements, "matchesPlayed", thr);
    return {
      icon: <Medal />,
      unlocked: cnt > 0,
      label: `${thr}+ Matches in Season`,
      count: cnt,
    };
  });
  // season wins
  const seasonWinMilestones = [5, 10, 20, 40].map((thr) => {
    const cnt = countSeasonsAtOrAbove(achievements, "wins", thr);
    return {
      icon: <Trophy />,
      unlocked: cnt > 0,
      label: `${thr}+ Wins in Season`,
      count: cnt,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Achievements</CardTitle>
      </CardHeader>
      <CardContent>
        {renderRow("Season Podiums", seasonStars)}
        {renderRow("Tournament Podiums", tournStars)}
        {renderRow("Tournaments Played", tournamentMilestones)}
        {renderRow("Total Matches (Overall)", overallMatchMilestones)}
        {renderRow("Total Wins (Overall)", overallWinMilestones)}
        {renderRow("Longest Win Streak", overallStreakMilestones)}
        {renderRow("Matches in a Season", seasonMatchMilestones)}
        {renderRow("Wins in a Season", seasonWinMilestones)}
      </CardContent>
    </Card>
  );
}