/* src/components/BracketView.tsx */
'use client';

import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import type { Tournament } from '@/lib/types';
import { computeTable, seedKnockoutRounds } from '@/lib/utils/bracketUtils';
import { collection, doc, runTransaction, Timestamp } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  ScrollArea,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { getFinnishFormattedDate } from '@/lib/utils';

interface Props {
  tournament: Tournament;
  onUpdate: () => void;
}

const computeDelta = (place: number) =>
  place === 1 ? 100 : place === 2 ? 60 : place === 3 ? 40 : 10;

export default function BracketView({ tournament, onUpdate }: Props) {
  const { t } = useTranslation();
  const [bracket, setBracket] = useState(tournament.bracket);
  useEffect(() => setBracket(tournament.bracket), [tournament.bracket]);

  const persist = async (next: any) => {
    // сохраняем сетку и чемпиона (без флага — флаг ставим в saveResults транзакционно)
    await runTransaction(db, async (tx) => {
      const tRef = doc(db, 'tournament-rooms', tournament.id);
      const snap = await tx.get(tRef);
      if (!snap.exists()) return;
      tx.update(tRef, {
        bracket: next,
        champion: next.champion ?? null,
      });
    });

    // фиксация результатов — строго один раз благодаря флагу resultsCommitted
    if (next.stage === 'completed') {
      await saveResults(next);
    }
    onUpdate();
  };

  /**
   * Идемпотентная фиксация результатов:
   * - Если у турнира уже стоит resultsCommitted: true — выходим.
   * - Иначе в одной транзакции:
   *   - для каждого участника проверяем, нет ли уже достижения с этим tournamentId
   *     и только тогда обновляем globalElo / eloHistory / achievements;
   *   - создаём/обновляем документы матчей финала и бронзы с детерминированными ID;
   *   - выставляем resultsCommitted: true.
   */
  const saveResults = async (next: any) => {
    const date = getFinnishFormattedDate();
    const ts = Timestamp.fromDate(new Date());

    const finalRound = next.rounds.find((r: any) => r.type === 'knockoutFinal');
    const bronzeRound = next.rounds.find(
      (r: any) => r.type === 'knockoutBronze'
    );
    if (!finalRound?.matches?.length) return; // safety

    const finalMatch = finalRound.matches[0];
    const bronzeMatch = bronzeRound?.matches?.[0];

    const tRef = doc(db, 'tournament-rooms', tournament.id);
    const matchesCol = collection(db, 'matches');

    const finalMatchRef = doc(matchesCol, `${tournament.id}-final`);
    const bronzeMatchRef = bronzeMatch
      ? doc(matchesCol, `${tournament.id}-bronze`)
      : null;

    // подготовим быстрый поиск place/wins/losses/pf/pa по userId
    const statByUser: Record<
      string,
      {
        name: string;
        place: number;
        wins: number;
        losses: number;
        pf: number;
        pa: number;
      }
    > = {};
    (next.finalStats || []).forEach((p: any) => {
      statByUser[p.userId] = {
        name: p.name,
        place: p.place,
        wins: p.wins,
        losses: p.losses,
        pf: p.pf,
        pa: p.pa,
      };
    });

    await runTransaction(db, async (tx) => {
      const tSnap = await tx.get(tRef);
      if (!tSnap.exists()) return;

      // уже обработано — выходим
      if (tSnap.data()?.resultsCommitted === true) return;

      // обновим игроков (только если нет достижения по этому турниру)
      const handleUser = async (userId: string) => {
        const uRef = doc(db, 'users', userId);
        const uSnap = await tx.get(uRef);
        if (!uSnap.exists()) return;

        const uData = uSnap.data() || {};
        const achievements: any[] = Array.isArray(uData.achievements)
          ? uData.achievements
          : [];
        const already = achievements.some(
          (a) =>
            a?.type === 'tournamentFinish' && a?.tournamentId === tournament.id
        );

        // если уже есть достижение — НЕ меняем ни рейтинг, ни историю, ни достижения (идемпотентность)
        if (already) return;

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
        };

        const newAchievements = [...achievements, newAchievement];

        const eloHistory: any[] = Array.isArray(uData.eloHistory)
          ? uData.eloHistory
          : [];
        const newEloHistory = [...eloHistory, { date, elo: newElo }];

        tx.update(uRef, {
          globalElo: newElo,
          eloHistory: newEloHistory,
          achievements: newAchievements,
        });
      };

      // Все участники из finalStats
      const userIds = Object.keys(statByUser);
      for (const uid of userIds) {
        await handleUser(uid);
      }

      // финальный матч
      const fP1Id = finalMatch.player1.userId;
      const fP2Id = finalMatch.player2.userId;
      const fP1 = statByUser[fP1Id];
      const fP2 = statByUser[fP2Id];

      if (fP1 && fP2) {
        tx.set(
          finalMatchRef,
          {
            tournamentId: tournament.id,
            tournamentName: tournament.name,
            tournamentStage: 'final',
            isTournament: true,
            timestamp: date,
            playedAt: ts,
            roomId: tournament.id, // исторически поле так называется в матчах
            winner: finalMatch.winner === fP1Id ? fP1.name : fP2.name,
            players: [fP1Id, fP2Id],
            player1Id: fP1Id,
            player2Id: fP2Id,
            player1: {
              name: fP1.name,
              side: 'left',
              scores: finalMatch.scorePlayer1,
              oldRating: Number(
                (tSnap.data() as any).oldEloMap?.[fP1Id] ??
                  uDataSafe(tSnap, fP1Id)?.globalElo ??
                  1000
              ),
              newRating: Number(uDataSafe(tSnap, fP1Id)?.globalElo ?? 1000), // информативно; в транзакции уже обновили
              addedPoints: computeDelta(fP1.place),
              roomOldRating: Number(
                (tSnap.data() as any).oldEloMap?.[fP1Id] ??
                  uDataSafe(tSnap, fP1Id)?.globalElo ??
                  1000
              ),
              roomNewRating: Number(uDataSafe(tSnap, fP1Id)?.globalElo ?? 1000),
              roomAddedPoints: computeDelta(fP1.place),
            },
            player2: {
              name: fP2.name,
              side: 'right',
              scores: finalMatch.scorePlayer2,
              oldRating: Number(
                (tSnap.data() as any).oldEloMap?.[fP2Id] ??
                  uDataSafe(tSnap, fP2Id)?.globalElo ??
                  1000
              ),
              newRating: Number(uDataSafe(tSnap, fP2Id)?.globalElo ?? 1000),
              addedPoints: computeDelta(fP2.place),
              roomOldRating: Number(
                (tSnap.data() as any).oldEloMap?.[fP2Id] ??
                  uDataSafe(tSnap, fP2Id)?.globalElo ??
                  1000
              ),
              roomNewRating: Number(uDataSafe(tSnap, fP2Id)?.globalElo ?? 1000),
              roomAddedPoints: computeDelta(fP2.place),
            },
          },
          { merge: true }
        );
      }

      // матч за бронзу (если есть)
      if (bronzeMatch && bronzeMatchRef) {
        const bP1Id = bronzeMatch.player1.userId;
        const bP2Id = bronzeMatch.player2.userId;
        const bP1 = statByUser[bP1Id];
        const bP2 = statByUser[bP2Id];

        if (bP1 && bP2) {
          tx.set(
            bronzeMatchRef,
            {
              tournamentId: tournament.id,
              tournamentName: tournament.name,
              tournamentStage: 'bronze',
              isTournament: true,
              timestamp: date,
              playedAt: ts,
              roomId: tournament.id,
              winner: bronzeMatch.winner === bP1Id ? bP1.name : bP2.name,
              players: [bP1Id, bP2Id],
              player1Id: bP1Id,
              player2Id: bP2Id,
              player1: {
                name: bP1.name,
                side: 'left',
                scores: bronzeMatch.scorePlayer1,
                oldRating: Number(
                  (tSnap.data() as any).oldEloMap?.[bP1Id] ??
                    uDataSafe(tSnap, bP1Id)?.globalElo ??
                    1000
                ),
                newRating: Number(uDataSafe(tSnap, bP1Id)?.globalElo ?? 1000),
                addedPoints: computeDelta(bP1.place),
                roomOldRating: Number(
                  (tSnap.data() as any).oldEloMap?.[bP1Id] ??
                    uDataSafe(tSnap, bP1Id)?.globalElo ??
                    1000
                ),
                roomNewRating: Number(
                  uDataSafe(tSnap, bP1Id)?.globalElo ?? 1000
                ),
                roomAddedPoints: computeDelta(bP1.place),
              },
              player2: {
                name: bP2.name,
                side: 'right',
                scores: bronzeMatch.scorePlayer2,
                oldRating: Number(
                  (tSnap.data() as any).oldEloMap?.[bP2Id] ??
                    uDataSafe(tSnap, bP2Id)?.globalElo ??
                    1000
                ),
                newRating: Number(uDataSafe(tSnap, bP2Id)?.globalElo ?? 1000),
                addedPoints: computeDelta(bP2.place),
                roomOldRating: Number(
                  (tSnap.data() as any).oldEloMap?.[bP2Id] ??
                    uDataSafe(tSnap, bP2Id)?.globalElo ??
                    1000
                ),
                roomNewRating: Number(
                  uDataSafe(tSnap, bP2Id)?.globalElo ?? 1000
                ),
                roomAddedPoints: computeDelta(bP2.place),
              },
            },
            { merge: true }
          );
        }
      }

      // помечаем результаты как зафиксированные
      tx.update(tRef, { resultsCommitted: true });
    });
  };

  // утилита: безопасно найти внутри снапшота вложенные user данные, если когда-то кешировали (если нет — вернёт undefined)
  const uDataSafe = (tSnap: any, _uid: string): any | undefined => {
    // нет кэша — ладно; поля oldRating/newRating для матча мы всё равно заполняем корректно через текущий globalElo
    return undefined;
  };

  if (!bracket)
    return (
      <p className='text-center text-muted-foreground'>
        {t('Bracket not available')}
      </p>
    );

  const rrRounds = bracket.rounds.filter((r: any) => r.type === 'roundRobin');

  const uniqMap = new Map<string, any>();
  bracket.rounds
    .filter((r: any) => r.type.startsWith('knockout'))
    .forEach((r: any) => uniqMap.set(`${r.type}-${r.roundIndex}`, r));

  const koOrder = {
    knockoutQuarters: 0,
    knockoutSemis: 1,
    knockoutBronze: 2,
    knockoutFinal: 3,
  } as const;

  const koRounds = Array.from(uniqMap.values()).sort(
    (a: any, b: any) =>
      koOrder[a.type as keyof typeof koOrder] -
        koOrder[b.type as keyof typeof koOrder] || a.roundIndex - b.roundIndex
  );

  return (
    <div className='space-y-10'>
      {rrRounds.map((r: any) => (
        <RoundEditor
          key={`rr-${r.roundIndex}`}
          round={r}
          bracket={bracket}
          persist={persist}
          roundType='rr'
          t={t}
        />
      ))}

      {koRounds.map((r: any) => (
        <RoundEditor
          key={`${r.type}-${r.roundIndex}`}
          round={r}
          bracket={bracket}
          persist={persist}
          roundType='ko'
          t={t}
        />
      ))}

      {bracket.stage === 'completed' && (
        <FinalTable stats={bracket.finalStats} t={t} />
      )}
    </div>
  );
}

function RoundEditor({ round, bracket, persist, roundType, t }: any) {
  const { toast } = useToast();
  const [matches, setMatches] = useState(round.matches);
  useEffect(() => setMatches(round.matches), [round.matches]);

  const okRR = (m: any) =>
    typeof m.scorePlayer1 === 'number' &&
    typeof m.scorePlayer2 === 'number' &&
    Math.abs(m.scorePlayer1 - m.scorePlayer2) >= 2;

  const okKO = (m: any) =>
    typeof m.scorePlayer1 === 'number' &&
    typeof m.scorePlayer2 === 'number' &&
    m.scorePlayer1 !== m.scorePlayer2;

  const validator = roundType === 'rr' ? okRR : okKO;

  const save = (id: string) => {
    const idx = matches.findIndex((m: any) => m.matchId === id);
    const m = matches[idx];
    if (!validator(m)) {
      toast({ title: t('Invalid score'), variant: 'destructive' });
      return;
    }
    const winner =
      m.scorePlayer1 > m.scorePlayer2 ? m.player1.userId : m.player2.userId;
    const upd = { ...m, matchStatus: 'finished', winner };
    const next = [...matches];
    next[idx] = upd;
    const updRounds = bracket.rounds.map((r: any) =>
      r.roundIndex === round.roundIndex ? { ...round, matches: next } : r
    );
    persist({ ...bracket, rounds: updRounds });
  };

  const finish = () => {
    const updRounds = bracket.rounds.map((r: any) =>
      r.roundIndex === round.roundIndex ? { ...round, status: 'finished' } : r
    );
    const next = { ...bracket, rounds: updRounds };
    seedKnockoutRounds(next);
    persist(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t(round.label)} ({t(round.status)})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('P1')}</TableHead>
                <TableHead className='text-center'>{t('S')}</TableHead>
                <TableHead className='text-center'>{t('S')}</TableHead>
                <TableHead className='text-right'>{t('P2')}</TableHead>
                <TableHead className='text-center'>{t('Winner')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {matches.map((m: any) => {
                const fin = m.matchStatus === 'finished';
                return (
                  <TableRow
                    key={m.matchId}
                    className={fin ? '' : 'bg-accent/10'}
                  >
                    <TableCell>
                      {m.player1?.name}
                      {m.player1?.place ? ` (${m.player1.place})` : ''}
                    </TableCell>
                    <TableCell className='text-center'>
                      <Input
                        type='number'
                        disabled={fin}
                        value={m.scorePlayer1 ?? ''}
                        onChange={(e) =>
                          setMatches((ms: any[]) =>
                            ms.map((x: any) =>
                              x.matchId === m.matchId
                                ? { ...x, scorePlayer1: Number(e.target.value) }
                                : x
                            )
                          )
                        }
                        className='w-16 mx-auto text-center'
                      />
                    </TableCell>
                    <TableCell className='text-center'>
                      <Input
                        type='number'
                        disabled={fin}
                        value={m.scorePlayer2 ?? ''}
                        onChange={(e) =>
                          setMatches((ms: any[]) =>
                            ms.map((x: any) =>
                              x.matchId === m.matchId
                                ? { ...x, scorePlayer2: Number(e.target.value) }
                                : x
                            )
                          )
                        }
                        className='w-16 mx-auto text-center'
                      />
                    </TableCell>
                    <TableCell className='text-right'>
                      {m.player2?.name}
                      {m.player2?.place ? ` (${m.player2.place})` : ''}
                    </TableCell>
                    <TableCell className='text-center font-semibold'>
                      {fin
                        ? m.winner === m.player1.userId
                          ? m.player1.name
                          : m.player2.name
                        : '—'}
                    </TableCell>
                    <TableCell className='text-center'>
                      {!fin && (
                        <Button size='sm' onClick={() => save(m.matchId)}>
                          {t('Save')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </ScrollArea>

        {round.status === 'inProgress' && (
          <div className='flex justify-end mt-4'>
            <Button
              onClick={finish}
              disabled={
                !matches.every((m: any) => m.matchStatus === 'finished')
              }
            >
              {t('Finish Round')}
            </Button>
          </div>
        )}

        {roundType === 'rr' && round.status === 'finished' && (
          <Standings matches={matches} t={t} />
        )}
      </CardContent>
    </Card>
  );
}

function Standings({
  matches,
  t,
}: {
  matches: any[];
  t: (key: string) => string;
}) {
  const rows = computeTable(matches);
  return (
    <div className='mt-6'>
      <ScrollArea>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Place')}</TableHead>
              <TableHead>{t('Player')}</TableHead>
              <TableHead>{t('W')}</TableHead>
              <TableHead>{t('L')}</TableHead>
              <TableHead>{t('PF')}</TableHead>
              <TableHead>{t('PA')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p: any) => (
              <TableRow key={p.userId}>
                <TableCell>{p.place}</TableCell>
                <TableCell>{p.name}</TableCell>
                <TableCell>{p.wins}</TableCell>
                <TableCell>{p.losses}</TableCell>
                <TableCell>{p.pf}</TableCell>
                <TableCell>{p.pa}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  );
}

function FinalTable({
  stats,
  t,
}: {
  stats?: any[];
  t: (key: string) => string;
}) {
  if (!stats?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Final Standings')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Place')}</TableHead>
                <TableHead>{t('Player')}</TableHead>
                <TableHead>{t('W')}</TableHead>
                <TableHead>{t('L')}</TableHead>
                <TableHead>{t('PF')}</TableHead>
                <TableHead>{t('PA')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.map((p: any) => (
                <TableRow key={p.userId}>
                  <TableCell>{p.place}</TableCell>
                  <TableCell>
                    <a
                      href={`/profile/${p.userId}`}
                      className='text-blue-500 underline-offset-4'
                    >
                      {p.name}
                    </a>
                  </TableCell>
                  <TableCell>{p.wins}</TableCell>
                  <TableCell>{p.losses}</TableCell>
                  <TableCell>{p.pf}</TableCell>
                  <TableCell>{p.pa}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
