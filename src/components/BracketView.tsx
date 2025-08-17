/* src/components/BracketView.tsx */
'use client';

import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import type { Tournament } from '@/lib/types';
import { computeTable, seedKnockoutRounds } from '@/lib/utils/bracketUtils';
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  runTransaction,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
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
    await updateDoc(doc(db, 'tournament-rooms', tournament.id), {
      bracket: next,
      champion: next.champion ?? null,
    });
    if (next.stage === 'completed') await saveResults(next);
    onUpdate();
  };

  const saveResults = async (next: any) => {
    const date = getFinnishFormattedDate();
    const ts = Timestamp.fromDate(new Date());

    const stash: Record<
      string,
      {
        name: string;
        oldElo: number;
        newElo: number;
        delta: number;
        place: number;
      }
    > = {};

    await Promise.all(
      next.finalStats.map(async (p: any) => {
        const delta = computeDelta(p.place);
        const userRef = doc(db, 'users', p.userId);

        await runTransaction(db, async (tx) => {
          const snap = await tx.get(userRef);
          const prevElo = snap.data()?.globalElo ?? 1000;
          const newElo = prevElo + delta;

          stash[p.userId] = {
            name: p.name,
            place: p.place,
            oldElo: prevElo,
            newElo,
            delta,
          };

          tx.update(userRef, {
            eloHistory: arrayUnion({ date, elo: newElo }),
            globalElo: newElo,
            achievements: arrayUnion({
              type: 'tournamentFinish',
              dateFinished: date,
              tournamentId: tournament.id,
              tournamentName: tournament.name,
              place: p.place,
              wins: p.wins,
              losses: p.losses,
              pointsFor: p.pf,
              pointsAgainst: p.pa,
            }),
          });
        });
      })
    );

    const finalRound = next.rounds.find((r: any) => r.type === 'knockoutFinal');
    const bronzeRound = next.rounds.find(
      (r: any) => r.type === 'knockoutBronze'
    );
    if (!finalRound?.matches?.length) return; // safety

    const pushMatch = async (match: any, stage: 'final' | 'bronze') => {
      const p1Id = match.player1.userId;
      const p2Id = match.player2.userId;
      const p1 = stash[p1Id];
      const p2 = stash[p2Id];

      if (!p1 || !p2) return;

      await addDoc(collection(db, 'matches'), {
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        tournamentStage: stage,
        isTournament: true,
        timestamp: date,
        playedAt: ts,
        roomId: tournament.id,
        winner: match.winner === p1Id ? p1.name : p2.name,
        players: [p1Id, p2Id],
        player1Id: p1Id,
        player2Id: p2Id,
        player1: {
          name: p1.name,
          side: 'left',
          scores: match.scorePlayer1,
          oldRating: p1.oldElo,
          newRating: p1.newElo,
          addedPoints: p1.delta,
          roomOldRating: p1.oldElo,
          roomNewRating: p1.newElo,
          roomAddedPoints: p1.delta,
        },
        player2: {
          name: p2.name,
          side: 'right',
          scores: match.scorePlayer2,
          oldRating: p2.oldElo,
          newRating: p2.newElo,
          addedPoints: p2.delta,
          roomOldRating: p2.oldElo,
          roomNewRating: p2.newElo,
          roomAddedPoints: p2.delta,
        },
      });
    };

    await pushMatch(finalRound.matches[0], 'final');
    if (bronzeRound?.matches?.length)
      await pushMatch(bronzeRound.matches[0], 'bronze');
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
      {rrRounds.map((r) => (
        <RoundEditor
          key={`rr-${r.roundIndex}`}
          round={r}
          bracket={bracket}
          persist={persist}
          roundType='rr'
          t={t}
        />
      ))}

      {koRounds.map((r) => (
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
                          setMatches((ms) =>
                            ms.map((x) =>
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
                          setMatches((ms) =>
                            ms.map((x) =>
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
            {rows.map((p) => (
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
              {stats.map((p) => (
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
