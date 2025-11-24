/* src/components/BracketView.tsx */
'use client';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Progress,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import type { Tournament } from '@/lib/types';
import { getFinnishFormattedDate } from '@/lib/utils';
import { computeTable, seedKnockoutRounds } from '@/lib/utils/bracketUtils';
import { collection, doc, runTransaction, Timestamp } from 'firebase/firestore';
import { Check, Crown, Save, Trophy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  tournament: Tournament;
  onUpdate: () => void;
}

const REWARDS = {
  1: 100,
  2: 75,
  3: 50,
  default: 10,
};

const computeDelta = (place: number) =>
  place === 1
    ? REWARDS[1]
    : place === 2
    ? REWARDS[2]
    : place === 3
    ? REWARDS[3]
    : REWARDS.default;

const parseScore = (val: any) => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

export default function BracketView({ tournament, onUpdate }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [bracket, setBracket] = useState(tournament.bracket);

  useEffect(() => {
    setBracket(tournament.bracket);
  }, [tournament.bracket]);

  // Автоматическая попытка сохранения результатов
  useEffect(() => {
    if (
      tournament.bracket.stage === 'completed' &&
      !(tournament as any).resultsCommitted
    ) {
      saveResults(tournament.bracket);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament.bracket.stage, (tournament as any).resultsCommitted]);

  const persist = async (next: any) => {
    // Дедупликация раундов перед сохранением (на всякий случай)
    const uniqueRounds = Array.from(
      new Map(
        next.rounds.map((r: any) => [`${r.type}-${r.roundIndex}`, r])
      ).values()
    );
    const cleanNext = { ...next, rounds: uniqueRounds };

    setBracket(cleanNext);

    await runTransaction(db, async (tx) => {
      const tRef = doc(db, 'tournament-rooms', tournament.id);
      const snap = await tx.get(tRef);
      if (!snap.exists()) return;

      tx.update(tRef, {
        bracket: cleanNext,
        champion: cleanNext.champion ?? null,
        isFinished: cleanNext.stage === 'completed',
      });
    });

    if (cleanNext.stage === 'completed') {
      await saveResults(cleanNext);
    }
    onUpdate();
  };

  const saveResults = async (next: any) => {
    const date = getFinnishFormattedDate();
    const ts = Timestamp.fromDate(new Date());

    const finalRound = next.rounds.find((r: any) => r.type === 'knockoutFinal');
    const bronzeRound = next.rounds.find(
      (r: any) => r.type === 'knockoutBronze'
    );

    if (!finalRound?.matches?.[0]?.winner) return;

    const finalMatch = finalRound.matches[0];
    const bronzeMatch = bronzeRound?.matches?.[0];

    const tRef = doc(db, 'tournament-rooms', tournament.id);
    const matchesCol = collection(db, 'matches');
    const finalMatchRef = doc(matchesCol, `${tournament.id}-final`);
    const bronzeMatchRef = bronzeMatch
      ? doc(matchesCol, `${tournament.id}-bronze`)
      : null;

    const statByUser: Record<string, any> = {};
    (next.finalStats || []).forEach((p: any) => {
      statByUser[p.userId] = p;
    });

    try {
      await runTransaction(db, async (tx) => {
        const tSnap = await tx.get(tRef);
        if (!tSnap.exists()) throw new Error('Tournament not found');
        if (tSnap.data()?.resultsCommitted === true) return;

        const userIds = Object.keys(statByUser);
        const userRefs = userIds.map((id) => doc(db, 'users', id));
        const userSnaps = await Promise.all(userRefs.map((ref) => tx.get(ref)));

        userSnaps.forEach((uSnap) => {
          if (!uSnap.exists()) return;

          const userId = uSnap.id;
          const uData = uSnap.data() || {};
          const achievements = Array.isArray(uData.achievements)
            ? uData.achievements
            : [];

          if (
            achievements.some(
              (a: any) =>
                a?.type === 'tournamentFinish' &&
                a?.tournamentId === tournament.id
            )
          ) {
            return;
          }

          const s = statByUser[userId];
          if (!s) return;

          const delta = computeDelta(s.place);
          const prevElo = Number(uData.globalElo ?? 1000);
          const newElo = prevElo + delta;

          const newAchievement = {
            type: 'tournamentFinish',
            dateFinished: date,
            tournamentId: tournament.id,
            tournamentName: tournament.name,
            place: s.place,
            wins: s.wins,
            losses: s.losses,
            pointsFor: s.pf,
            pointsAgainst: s.pa,
            eloReward: delta,
            sport: tournament.sport || 'pingpong',
          };

          const sport = tournament.sport || 'pingpong';
          const sportEloPath = `sports.${sport}.globalElo`;
          const sportEloHistoryPath = `sports.${sport}.eloHistory`;

          const currentSportElo = uData.sports?.[sport]?.globalElo ?? 1000;
          const newSportElo = currentSportElo + delta;
          const sportHistory = uData.sports?.[sport]?.eloHistory || [];

          tx.update(uSnap.ref, {
            globalElo: newElo,
            eloHistory: [...(uData.eloHistory || []), { date, elo: newElo }],
            achievements: [...achievements, newAchievement],
            [sportEloPath]: newSportElo,
            [sportEloHistoryPath]: [
              ...sportHistory,
              { date: ts.toDate().toISOString(), elo: newSportElo },
            ],
          });

          const rewardMatchRef = doc(matchesCol);
          tx.set(rewardMatchRef, {
            isRanked: true,
            isTournamentReward: true,
            roomId: tournament.id,
            timestamp: date,
            tsIso: ts.toDate().toISOString(),
            createdAt: date,
            player1Id: userId,
            player2Id: 'SYSTEM',
            winner: userId,
            players: [userId],
            sport: sport,
            player1: {
              name: uData.name || uData.displayName || 'Player',
              scores: 1,
              oldRating: currentSportElo,
              newRating: newSportElo,
              addedPoints: delta,
              roomOldRating: 0,
              roomNewRating: 0,
              roomAddedPoints: 0,
              side: 'left',
            },
            player2: {
              name: `${t('Tournament')}: ${tournament.name} (#${s.place})`,
              scores: 0,
              oldRating: 0,
              newRating: 0,
              addedPoints: 0,
              roomOldRating: 0,
              roomNewRating: 0,
              roomAddedPoints: 0,
              side: 'right',
            },
          });
        });

        const saveMatchDoc = (m: any, ref: any, stage: string) => {
          if (!m.winner) return;
          const p1Id = m.player1.userId;
          const p2Id = m.player2.userId;
          const p1Stat = statByUser[p1Id];
          const p2Stat = statByUser[p2Id];

          if (!p1Stat || !p2Stat) return;

          tx.set(
            ref,
            {
              tournamentId: tournament.id,
              tournamentName: tournament.name,
              tournamentStage: stage,
              isTournament: true,
              timestamp: date,
              playedAt: ts,
              roomId: tournament.id,
              winner: m.winner === p1Id ? p1Stat.name : p2Stat.name,
              players: [p1Id, p2Id],
              player1Id: p1Id,
              player2Id: p2Id,
              sport: tournament.sport || 'pingpong',
              player1: {
                name: p1Stat.name,
                scores: parseScore(m.scorePlayer1),
                side: 'left',
                oldRating: 0,
                newRating: 0,
                roomOldRating: 0,
                roomNewRating: 0,
                addedPoints: 0,
                roomAddedPoints: 0,
              },
              player2: {
                name: p2Stat.name,
                scores: parseScore(m.scorePlayer2),
                side: 'right',
                oldRating: 0,
                newRating: 0,
                roomOldRating: 0,
                roomNewRating: 0,
                addedPoints: 0,
                roomAddedPoints: 0,
              },
            },
            { merge: true }
          );
        };

        saveMatchDoc(finalMatch, finalMatchRef, 'final');
        if (bronzeMatch && bronzeMatch.winner) {
          saveMatchDoc(bronzeMatch, bronzeMatchRef, 'bronze');
        }

        tx.update(tRef, { resultsCommitted: true });
      });

      toast({ title: t('Tournament results saved & rewards distributed!') });
      onUpdate();
    } catch (error) {
      console.error('Failed to save results:', error);
      toast({ title: t('Error saving results'), variant: 'destructive' });
    }
  };

  // Дедупликация раундов для рендеринга (исправляет ошибку React ключей)
  const uniqueRounds = useMemo(() => {
    if (!bracket?.rounds) return [];
    const map = new Map();
    // Если есть дубликаты, берем последний (обычно самый актуальный)
    bracket.rounds.forEach((r: any) => {
      map.set(`${r.type}-${r.roundIndex}`, r);
    });
    return Array.from(map.values());
  }, [bracket]);

  if (!bracket) return null;

  const rrRounds = uniqueRounds.filter((r: any) => r.type === 'roundRobin');

  const koRounds = uniqueRounds
    .filter((r: any) => r.type.startsWith('knockout'))
    .sort((a: any, b: any) => {
      const order: Record<string, number> = {
        knockoutQuarters: 1,
        knockoutSemis: 2,
        knockoutBronze: 3,
        knockoutFinal: 4,
      };
      const typeOrder = (order[a.type] || 0) - (order[b.type] || 0);
      if (typeOrder !== 0) return typeOrder;
      return a.roundIndex - b.roundIndex;
    });

  const activeTab =
    bracket.stage === 'completed'
      ? 'final'
      : koRounds.some((r: any) => r.status === 'inProgress')
      ? 'playoff'
      : 'group';

  return (
    <div className='space-y-6'>
      {/* Status Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-2xl font-bold flex items-center gap-2'>
            {tournament.name}
            {bracket.stage === 'completed' && (
              <Badge
                variant='default'
                className='bg-yellow-500 hover:bg-yellow-600'
              >
                {t('Completed')}
              </Badge>
            )}
            {bracket.stage === 'inProgress' && (
              <Badge
                variant='outline'
                className='text-green-600 border-green-600 animate-pulse'
              >
                {t('Live')}
              </Badge>
            )}
          </h2>
          <p className='text-muted-foreground text-sm'>
            {tournament.description}
          </p>
        </div>
        {/* Champion Display */}
        {bracket.champion && (
          <div className='flex items-center gap-3 bg-yellow-50 border border-yellow-200 px-4 py-2 rounded-lg'>
            <div className='p-2 bg-yellow-100 rounded-full'>
              <Crown className='h-5 w-5 text-yellow-600' />
            </div>
            <div>
              <div className='text-xs text-yellow-700 uppercase font-bold'>
                {t('Champion')}
              </div>
              <div className='font-bold text-yellow-900'>
                {bracket.champion.name}
              </div>
            </div>
          </div>
        )}
      </div>

      <Tabs defaultValue={activeTab} className='w-full'>
        <TabsList className='grid w-full grid-cols-3 mb-6'>
          <TabsTrigger value='group'>{t('Group Stage')}</TabsTrigger>
          <TabsTrigger
            value='playoff'
            disabled={rrRounds.some((r: any) => r.status !== 'finished')}
          >
            {t('Playoffs')}
          </TabsTrigger>
          <TabsTrigger value='final' disabled={bracket.stage !== 'completed'}>
            {t('Standings')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value='group' className='space-y-6'>
          {rrRounds.map((r: any) => (
            <RoundCard
              key={`rr-${r.roundIndex}`}
              round={r}
              bracket={bracket}
              persist={persist}
              type='rr'
              t={t}
            />
          ))}
        </TabsContent>

        <TabsContent value='playoff' className='space-y-6'>
          {koRounds.map((r: any) => (
            <RoundCard
              key={`${r.type}-${r.roundIndex}`}
              round={r}
              bracket={bracket}
              persist={persist}
              type='ko'
              t={t}
            />
          ))}
        </TabsContent>

        <TabsContent value='final'>
          <FinalStandings stats={bracket.finalStats} t={t} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RoundCard({ round, bracket, persist, type, t }: any) {
  const { toast } = useToast();
  const [matches, setMatches] = useState(round.matches);

  useEffect(() => setMatches(round.matches), [round.matches]);

  const finishedCount = matches.filter(
    (m: any) => m.matchStatus === 'finished'
  ).length;
  const progress =
    matches.length > 0 ? (finishedCount / matches.length) * 100 : 0;

  const isRoundFinished = round.status === 'finished';
  const isRoundActive = round.status === 'inProgress';

  const validate = (m: any) => {
    const s1 = parseScore(m.scorePlayer1);
    const s2 = parseScore(m.scorePlayer2);
    if (type === 'rr') return Math.abs(s1 - s2) >= 2;
    return s1 !== s2;
  };

  const saveMatch = (matchId: string) => {
    const idx = matches.findIndex((m: any) => m.matchId === matchId);
    if (idx === -1) return;

    const m = matches[idx];
    if (!validate(m)) {
      toast({ title: t('Invalid score'), variant: 'destructive' });
      return;
    }

    const s1 = parseScore(m.scorePlayer1);
    const s2 = parseScore(m.scorePlayer2);
    const winner = s1 > s2 ? m.player1.userId : m.player2.userId;

    const updatedMatch = {
      ...m,
      scorePlayer1: s1,
      scorePlayer2: s2,
      matchStatus: 'finished',
      winner,
    };
    const newMatches = [...matches];
    newMatches[idx] = updatedMatch;

    // Обновляем с учетом дедупликации по типу и индексу
    const newRounds = bracket.rounds.map((r: any) => {
      if (r.roundIndex === round.roundIndex && r.type === round.type) {
        return { ...r, matches: newMatches };
      }
      return r;
    });

    persist({ ...bracket, rounds: newRounds });
    toast({ title: t('Match saved') });
  };

  const finishRound = () => {
    const newRounds = bracket.rounds.map((r: any) => {
      if (r.roundIndex === round.roundIndex && r.type === round.type) {
        return { ...r, status: 'finished' };
      }
      return r;
    });
    const nextBracket = { ...bracket, rounds: newRounds };
    seedKnockoutRounds(nextBracket);
    persist(nextBracket);
  };

  const updateScore = (matchId: string, p: '1' | '2', val: string) => {
    setMatches((prev: any[]) =>
      prev.map((m) =>
        m.matchId === matchId ? { ...m, [`scorePlayer${p}`]: val } : m
      )
    );
  };

  return (
    <Card
      className={`border-l-4 ${
        isRoundFinished ? 'border-l-green-500' : 'border-l-primary'
      }`}
    >
      <CardHeader className='pb-3'>
        <div className='flex justify-between items-center'>
          <CardTitle>{t(round.label)}</CardTitle>
          <div className='text-sm text-muted-foreground font-mono'>
            {finishedCount}/{matches.length} {t('matches')}
          </div>
        </div>
        <Progress value={progress} className='h-1' />
      </CardHeader>
      <CardContent>
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          {matches.map((m: any, i: number) => {
            const isDone = m.matchStatus === 'finished';
            const s1 = parseScore(m.scorePlayer1);
            const s2 = parseScore(m.scorePlayer2);
            const p1Win = isDone && s1 > s2;
            const p2Win = isDone && s2 > s1;

            return (
              <div
                key={m.matchId}
                className='bg-muted/30 rounded-lg p-3 border flex flex-col gap-3 relative'
              >
                {type === 'ko' && (
                  <div className='absolute top-2 right-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider'>
                    {t('Match')} {i + 1}
                  </div>
                )}

                {/* Player 1 Row */}
                <div
                  className={`flex items-center justify-between mt-2 ${
                    p1Win ? 'font-bold text-primary' : 'text-muted-foreground'
                  }`}
                >
                  <div className='flex items-center gap-2 min-w-0'>
                    {type === 'ko' && m.player1?.place && (
                      <span className='text-[10px] bg-muted-foreground/10 px-1 rounded'>
                        #{m.player1.place}
                      </span>
                    )}
                    <span className='text-sm truncate max-w-[120px]'>
                      {m.player1?.name || 'TBD'}
                    </span>
                    {p1Win && (
                      <Crown
                        size={14}
                        className='text-yellow-500 flex-shrink-0'
                      />
                    )}
                  </div>
                  <Input
                    type='number'
                    className={`w-14 h-8 text-center ${
                      p1Win ? 'bg-green-50 border-green-200 text-green-800' : ''
                    }`}
                    value={m.scorePlayer1 ?? ''}
                    onChange={(e) =>
                      updateScore(m.matchId, '1', e.target.value)
                    }
                    disabled={!isRoundActive && !isDone}
                  />
                </div>

                {/* Player 2 Row */}
                <div
                  className={`flex items-center justify-between ${
                    p2Win ? 'font-bold text-primary' : 'text-muted-foreground'
                  }`}
                >
                  <div className='flex items-center gap-2 min-w-0'>
                    {type === 'ko' && m.player2?.place && (
                      <span className='text-[10px] bg-muted-foreground/10 px-1 rounded'>
                        #{m.player2.place}
                      </span>
                    )}
                    <span className='text-sm truncate max-w-[120px]'>
                      {m.player2?.name || 'TBD'}
                    </span>
                    {p2Win && (
                      <Crown
                        size={14}
                        className='text-yellow-500 flex-shrink-0'
                      />
                    )}
                  </div>
                  <Input
                    type='number'
                    className={`w-14 h-8 text-center ${
                      p2Win ? 'bg-green-50 border-green-200 text-green-800' : ''
                    }`}
                    value={m.scorePlayer2 ?? ''}
                    onChange={(e) =>
                      updateScore(m.matchId, '2', e.target.value)
                    }
                    disabled={!isRoundActive && !isDone}
                  />
                </div>

                {!isDone && isRoundActive && (
                  <Button
                    size='sm'
                    variant='secondary'
                    className='w-full h-7 text-xs mt-1'
                    onClick={() => saveMatch(m.matchId)}
                    disabled={!m.player1 || !m.player2}
                  >
                    <Save size={12} className='mr-1' /> {t('Save Result')}
                  </Button>
                )}
                {isDone && (
                  <div className='text-center text-[10px] uppercase font-bold text-green-600 flex items-center justify-center gap-1 mt-1'>
                    <Check size={10} /> {t('Finished')}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {isRoundActive && (
          <div className='mt-6 flex justify-end'>
            <Button
              onClick={finishRound}
              disabled={finishedCount < matches.length}
              className='gap-2'
            >
              {t('Complete Round')} <Trophy size={16} />
            </Button>
          </div>
        )}

        {type === 'rr' && isRoundFinished && (
          <div className='mt-6 pt-4 border-t'>
            <h4 className='font-semibold mb-3 text-sm flex items-center gap-2'>
              <User size={14} /> {t('Group Standings')}
            </h4>
            <StandingsTable matches={matches} t={t} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StandingsTable({ matches, t }: any) {
  const rows = computeTable(matches);
  return (
    <div className='border rounded-md overflow-hidden'>
      <table className='w-full text-sm'>
        <thead className='bg-muted/50 text-muted-foreground text-xs uppercase'>
          <tr>
            <th className='p-2 text-center w-10'>#</th>
            <th className='p-2 text-left'>{t('Player')}</th>
            <th className='p-2 text-center w-12'>{t('W')}</th>
            <th className='p-2 text-center w-12'>{t('L')}</th>
            <th className='p-2 text-center w-12'>{t('Diff')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row: any, i: number) => (
            <tr key={row.userId} className='border-t hover:bg-muted/20'>
              <td className='p-2 text-center font-medium text-muted-foreground'>
                {i + 1}
              </td>
              <td className='p-2 font-medium'>{row.name}</td>
              <td className='p-2 text-center font-bold text-green-600'>
                {row.wins}
              </td>
              <td className='p-2 text-center text-red-600'>{row.losses}</td>
              <td className='p-2 text-center text-muted-foreground text-xs'>
                {row.pf - row.pa > 0 ? '+' : ''}
                {row.pf - row.pa}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FinalStandings({ stats, t }: any) {
  if (!stats?.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Trophy className='text-amber-500' /> {t('Final Standings')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='space-y-2'>
          {stats.map((p: any, i: number) => {
            const reward = computeDelta(p.place);
            return (
              <div
                key={p.userId}
                className='flex items-center justify-between p-3 bg-muted/20 rounded-lg border hover:bg-muted/40 transition-colors'
              >
                <div className='flex items-center gap-4'>
                  <div
                    className={`
                                        w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm shadow-sm
                                        ${
                                          p.place === 1
                                            ? 'bg-yellow-100 text-yellow-700 ring-2 ring-yellow-200'
                                            : p.place === 2
                                            ? 'bg-slate-100 text-slate-700 ring-2 ring-slate-200'
                                            : p.place === 3
                                            ? 'bg-orange-100 text-orange-800 ring-2 ring-orange-200'
                                            : 'bg-transparent text-muted-foreground'
                                        }
                                    `}
                  >
                    {p.place}
                  </div>
                  <div>
                    <div
                      className={`font-medium ${
                        p.place === 1 ? 'text-lg font-bold' : ''
                      }`}
                    >
                      {p.name}
                    </div>
                    <div className='text-xs font-semibold text-green-600'>
                      +{reward} ELO
                    </div>
                  </div>
                </div>
                <div className='text-sm text-muted-foreground font-mono'>
                  {p.wins}W - {p.losses}L
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
