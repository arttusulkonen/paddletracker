'use client';

import { ProtectedRoute } from '@/components/ProtectedRoutes';
import {
  Avatar, AvatarFallback, AvatarImage,
  Button,
  Card, CardContent, CardDescription, CardHeader, CardTitle,
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
  Input, Label,
  ScrollArea, Separator,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { finalizeSeason } from '@/lib/season';
import type { Match, Room, UserProfile } from '@/lib/types';
import { getFinnishFormattedDate } from '@/lib/utils';
import { parseFlexDate, safeFormatDate } from '@/lib/utils/date';
import {
  addDoc, arrayUnion,
  collection, doc, getDoc, getDocs,
  onSnapshot, orderBy, query, updateDoc, where,
} from 'firebase/firestore';
import {
  ArrowLeft, Crown, MailPlus, Plus, ShieldCheck, Sword, Trash2, Users,
} from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

/* ───────── helpers ───────── */
const calcWinPct = (w: number, l: number) => {
  const t = w + l;
  return t ? ((w / t) * 100).toFixed(1) : '0.0';
};
const tsToMs = (v?: string) =>
  parseFlexDate(v ?? '').getTime() || Date.parse(v ?? '') || 0;

// flip-helper для поля side
const flip = (s: string) => (s === 'left' ? 'right' : s === 'right' ? 'left' : '');

type StartEndElo = Record<string, { start: number; end: number }>;

/* ───────── main component ──────── */
export default function RoomPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const roomId = useParams().roomId as string;

  /* state */
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Room['members']>([]);
  const [recent, setRecent] = useState<Match[]>([]);
  const [seasonStarts, setSeasonStarts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  const [player1Id, setPlayer1Id] = useState('');
  const [player2Id, setPlayer2Id] = useState('');
  const [matchesInput, setMatchesInput] =
    useState([{ score1: '', score2: '', side1: '', side2: '' }]);
  const [isRecording, setIsRecording] = useState(false);

  const [latestSeason, setLatestSeason] = useState<any | null>(null);
  const [viewMode, setViewMode] = useState<'regular' | 'final'>('regular');
  const [sortConfig, setSortConfig] =
    useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'rating', dir: 'desc' });

  /* ───────── firestore listeners ───────── */
  useEffect(() => {
    if (!user) return;

    /* 1) Подписка на документ room */
    const unsubRoom = onSnapshot(doc(db, 'rooms', roomId), snap => {
      if (!snap.exists()) {
        router.push('/rooms');
        return;
      }
      const data = snap.data() as Room;
      const merged = (data.members ?? []).map(m => ({
        ...m,
        rating: m.roomNewRating ?? m.rating,
      }));
      setMembers(prev => {
        const map = new Map(prev.map(p => [p.userId, p]));
        merged.forEach(m => map.set(m.userId, { ...map.get(m.userId), ...m }));
        return Array.from(map.values());
      });
      setRoom({ ...data, members: merged });

      /* находим финальный snapshot внутри room.seasonHistory */
      setLatestSeason(
        data.seasonHistory?.slice().reverse()
          .find(s => Array.isArray(s.summary) || Array.isArray(s.members)) ?? null,
      );
      setIsLoading(false);
    });

    /* 2) Подписка на коллекцию matches текущей комнаты */
    const unsubMatches = onSnapshot(
      query(
        collection(db, 'matches'),
        where('roomId', '==', roomId),
        orderBy('tsIso', 'desc'),
      ),
      snap => {
        const fresh = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Match));

        // Собираем «первый oldRating» для каждого игрока (start Elo сезона)
        const starts: Record<string, number> = {};
        fresh.forEach((m) => {
          const p1 = m.player1Id, p2 = m.player2Id;
          if (starts[p1] == null) starts[p1] = m.player1.oldRating;
          if (starts[p2] == null) starts[p2] = m.player2.oldRating;
        });
        setSeasonStarts(starts);

        // Сохраняем отсортированный массив
        setRecent(fresh.sort((a, b) => tsToMs(b.tsIso) - tsToMs(a.tsIso)));
      },
    );

    return () => {
      unsubRoom();
      unsubMatches();
    };
  }, [user, roomId, router]);

  /* ───────── invite user ───────── */
  const handleInvite = async () => {
    if (!inviteEmail.trim() || !room) return;
    setIsInviting(true);
    try {
      const qs = query(collection(db, 'users'), where('email', '==', inviteEmail.trim()));
      const snap = await getDocs(qs);
      if (snap.empty) {
        toast({ title: 'User not found', variant: 'destructive' });
        return;
      }
      const uDoc = snap.docs[0];
      const target = uDoc.data() as UserProfile;
      const uid = uDoc.id;
      if (members.some(m => m.userId === uid)) {
        toast({ title: 'User already in room' });
        return;
      }
      const newMember = {
        userId: uid,
        name: target.name || target.email!,
        email: target.email!,
        rating: 1000,
        startRating: 1000,
        wins: 0,
        losses: 0,
        date: getFinnishFormattedDate(),
        role: 'editor' as const,
      };
      await updateDoc(doc(db, 'rooms', roomId), { members: arrayUnion(newMember) });
      toast({ title: 'Invited', description: `${newMember.name} added` });
      setInviteEmail('');
    } finally {
      setIsInviting(false);
    }
  };

  /* ───────── helpers для формы ───────── */
  const addRow = () => setMatchesInput(rows => {
    if (!rows.length)
      return [...rows, { score1: '', score2: '', side1: '', side2: '' }];

    const last = rows[rows.length - 1];
    return [
      ...rows,
      {
        score1: '',
        score2: '',
        side1: flip(last.side1),
        side2: flip(last.side2),
      },
    ];
  });
  const removeRow = (i: number) => setMatchesInput(r => r.filter((_, idx) => idx !== i));

  /* ───────── saveMatches (batch-safe ELO) ───────── */
  const saveMatches = async () => {
    if (!player1Id || !player2Id || player1Id === player2Id) {
      toast({ title: 'Select two different players', variant: 'destructive' });
      return;
    }

    const bad = matchesInput.find(({ score1, score2, side1, side2 }) => {
      const a = +score1, b = +score2;
      if (!a || !b || !side1 || !side2) return true;
      const hi = Math.max(a, b), lo = Math.min(a, b);
      return hi < 11 || (hi === 11 && lo > 9) || (hi > 11 && hi - lo !== 2);
    });
    if (bad) {
      toast({ title: 'Check the score values' });
      return;
    }

    setIsRecording(true);
    try {
      // 1) подтягиваем текущие globalElo один раз
      const [snap1, snap2] = await Promise.all([
        getDoc(doc(db, 'users', player1Id)),
        getDoc(doc(db, 'users', player2Id)),
      ]);
      let currentG1 = snap1.data()?.globalElo ?? 1000;
      let currentG2 = snap2.data()?.globalElo ?? 1000;

      // 2) локальный (черновой) массив участников комнаты
      let draft = JSON.parse(JSON.stringify(members)) as Room['members'];

      // 3) аккумулируем обновления для очерёдной записи истории rankHistories
      const historyUpdates: Record<string, any> = {};

      // 4) для разных матчей в одном батче делаем смещение timestamp на +1 с
      const startDate = new Date();

      // Функция для обновления rankHistories внутри draft
      const pushRank = (tsIso: string) => {
        draft.forEach(mem => {
          const place = [...draft]
            .sort((a, b) => b.rating - a.rating)
            .findIndex(x => x.userId === mem.userId) + 1;
          if (mem.prevPlace !== place) {
            historyUpdates[`rankHistories.${mem.userId}`] = arrayUnion({ ts: tsIso, place, rating: mem.rating });
          }
          mem.prevPlace = place;
        });
      };

      // 5) Проходим по каждому «под-матчу»
      for (let idx = 0; idx < matchesInput.length; idx++) {
        const row = matchesInput[idx];
        const a = +row.score1, b = +row.score2;
        const winnerId = a > b ? player1Id : player2Id;

        // 5.1) считаем новое globalElo без доп. чтений
        const K = 32;
        const exp1 = 1 / (1 + 10 ** ((currentG2 - currentG1) / 400));
        const exp2 = 1 / (1 + 10 ** ((currentG1 - currentG2) / 400));
        const newG1 = Math.round(currentG1 + K * ((winnerId === player1Id ? 1 : 0) - exp1));
        const newG2 = Math.round(currentG2 + K * ((winnerId === player2Id ? 1 : 0) - exp2));
        const dG1 = newG1 - currentG1;
        const dG2 = newG2 - currentG2;
        currentG1 = newG1;
        currentG2 = newG2;

        // 5.2) формируем уникальный timestamp
        const ts = new Date(startDate.getTime() + idx * 1000);
        const createdAt = getFinnishFormattedDate(ts);
        const tsIso = ts.toISOString();

        // 5.3) обновляем «черновой» рейтинг и статистику в draft
        const p1 = draft.find(m => m.userId === player1Id)!;
        const p2 = draft.find(m => m.userId === player2Id)!;
        [p1, p2].forEach(p => {
          const delta = p.userId === player1Id ? dG1 : dG2;
          const win = winnerId === p.userId;
          const curSt = win ? (p.currentStreak || 0) + 1 : 0;
          Object.assign(p, {
            rating: p.rating + delta,
            wins: p.wins + (win ? 1 : 0),
            losses: p.losses + (win ? 0 : 1),
            currentStreak: curSt,
            longestWinStreak: Math.max(p.longestWinStreak || 0, curSt),
            totalAddedPoints: (p.totalAddedPoints || 0) + delta,
            totalMatches: (p.totalMatches || 0) + 1,
          });
        });

        // 5.4) пушим историю рангов после перерасчёта
        pushRank(tsIso);

        // 5.5) собираем matchDoc и пушим в Firestore
        const matchDoc = {
          roomId,
          createdAt,
          timestamp: createdAt,
          tsIso,
          player1Id,
          player2Id,
          players: [player1Id, player2Id],
          player1: {
            name: p1.name,
            scores: a,
            oldRating: currentG1 - dG1,
            newRating: currentG1,
            addedPoints: dG1,
            roomOldRating: p1.rating - dG1,
            roomNewRating: p1.rating,
            roomAddedPoints: dG1,
            side: row.side1,
          },
          player2: {
            name: p2.name,
            scores: b,
            oldRating: currentG2 - dG2,
            newRating: currentG2,
            addedPoints: dG2,
            roomOldRating: p2.rating - dG2,
            roomNewRating: p2.rating,
            roomAddedPoints: dG2,
            side: row.side2,
          },
          winner: winnerId === player1Id ? p1.name : p2.name,
        } satisfies Omit<Match, 'id'>;

        const docRef = await addDoc(collection(db, 'matches'), matchDoc);
        setRecent(prev => prev.some(m => m.id === docRef.id)
          ? prev
          : [{ id: docRef.id, ...matchDoc } as Match, ...prev]);
      }

      // 6) обновляем UI-черновик участников
      setMembers(draft);

      // 7) сохраняем room с historyUpdates, обновляем globalElo у обоих игроков
      await Promise.all([
        updateDoc(doc(db, 'rooms', roomId), { members: draft, ...historyUpdates }),
        updateDoc(doc(db, 'users', player1Id), {
          globalElo: currentG1,
          eloHistory: arrayUnion({ ts: new Date().toISOString(), elo: currentG1 }),
        }),
        updateDoc(doc(db, 'users', player2Id), {
          globalElo: currentG2,
          eloHistory: arrayUnion({ ts: new Date().toISOString(), elo: currentG2 }),
        }),
      ]);

      // 8) сбрасываем форму
      setPlayer1Id('');
      setPlayer2Id('');
      setMatchesInput([{ score1: '', score2: '', side1: '', side2: '' }]);
      toast({ title: 'Matches recorded' });
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to record matches', variant: 'destructive' });
    } finally {
      setIsRecording(false);
    }
  };

  /* ───────── season snapshots ───────── */
  const getSeasonEloSnapshots = async (roomId: string): Promise<StartEndElo> => {
    const qs = query(collection(db, 'matches'), where('roomId', '==', roomId), orderBy('tsIso', 'asc'));
    const snap = await getDocs(qs);
    const firstSeen: Record<string, number> = {};
    const lastSeen: Record<string, number> = {};
    snap.docs.forEach(d => {
      const m = d.data() as any;
      const players: { id: string; old: number; new: number }[] = [
        { id: m.player1Id, old: m.player1.oldRating, new: m.player1.newRating },
        { id: m.player2Id, old: m.player2.oldRating, new: m.player2.newRating },
      ];
      players.forEach(p => {
        if (!(p.id in firstSeen)) firstSeen[p.id] = p.old;
        lastSeen[p.id] = p.new;
      });
    });
    const out: StartEndElo = {};
    Object.keys(firstSeen).forEach(uid => {
      out[uid] = { start: firstSeen[uid], end: lastSeen[uid] ?? firstSeen[uid] };
    });
    return out;
  };

  /* ───────── handleFinishSeason (единственная) ───────── */
  const handleFinishSeason = async () => {
    try {
      const eloSnapshots = await getSeasonEloSnapshots(roomId);
      await finalizeSeason(roomId, eloSnapshots);
      toast({ title: 'Season finished' });
      setViewMode('final');
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: 'Failed to finish season', variant: 'destructive' });
    }
  };

  /* ───────── helper фns for standings ───────── */
  const deltaRoom = (m: any) => (m.rating || 0) - (m.startRating ?? 1000);
  const avgPtsPerGame = (m: any) => (m.wins + m.losses ? deltaRoom(m) / (m.wins + m.losses) : 0);
  const last5Form = (m: any) => recent
    .filter(x => x.player1Id === m.userId || x.player2Id === m.userId)
    .slice(0, 5)
    .map(x => (x.winner === m.name || x.winner === m.userId) ? 'W' : 'L')
    .join(' ');
  const bestWinStreak = (m: any) => {
    const arr = recent
      .filter(x => x.player1Id === m.userId || x.player2Id === m.userId)
      .map(x => (x.winner === m.name || x.winner === m.userId) ? 1 : 0);
    let max = 0, cur = 0;
    arr.forEach(w => {
      cur = w ? cur + 1 : 0;
      if (cur > max) max = cur;
    });
    return max;
  };

  /* ───────────────────────── memo: regularPlayers ──────────────────── */
  const regularPlayers = useMemo(() => {
    return members.map((m) => {
      const total = (m.wins || 0) + (m.losses || 0);
      const globalStart = seasonStarts[m.userId] ?? m.globalElo ?? 0;
      const globalDelta = (m.globalElo ?? 0) - globalStart;
      return {
        ...m,
        totalMatches: total,
        ratingVisible: total >= 5,
        winPct: calcWinPct(m.wins || 0, m.losses || 0),
        deltaRoom: deltaRoom(m),
        globalDelta,
        avgPtsPerMatch: avgPtsPerGame(m),
        last5Form: last5Form(m),
        longestWinStreak: bestWinStreak(m),
      };
    }).sort((a: any, b: any) => {
      if (a.ratingVisible !== b.ratingVisible)
        return a.ratingVisible ? -1 : 1;
      const { key, dir } = sortConfig;
      const factor = dir === 'asc' ? 1 : -1;
      if (key === 'winPct')
        return factor * (parseFloat(a.winPct) - parseFloat(b.winPct));
      if (['name'].includes(key))
        return factor * a.name.localeCompare(b.name);
      return factor * ((a as any)[key] - (b as any)[key]);
    });
  }, [members, recent, seasonStarts, sortConfig]);

  /* ───────── load avatars & ranks once per members change ───────── */
  useEffect(() => {
    if (!members.length) return;
    const load = async () => {
      const upd = await Promise.all(members.map(async m => {
        const snap = await getDoc(doc(db, 'users', m.userId));
        const u = snap.exists() ? snap.data() : {};
        return {
          ...m,
          photoURL: u.photoURL || null,
          rank: u.rank || null,
          globalElo: u.globalElo || null,
          maxRating: u.maxRating || null,
        };
      }));
      setMembers(upd);
    };
    load();
  }, [members.length, recent]);

  if (isLoading || !room) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-16 w-16 rounded-full border-b-4 border-primary" />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------
  return (
    <ProtectedRoute>
      <div className="container mx-auto py-8 px-4">
        <Button
          variant="outline"
          className="mb-6"
          onClick={() => router.push('/rooms')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Rooms
        </Button>

        {/* Room header */}
        <Card className="mb-8 shadow-xl">
          <CardHeader className="bg-muted/50 p-6 flex flex-col md:flex-row items-center gap-6">
            <Avatar className="h-24 w-24 border-4 border-background shadow-md">
              <AvatarImage src={room.avatarURL || undefined} />
              <AvatarFallback>{room.name[0]}</AvatarFallback>
            </Avatar>
            <div className="text-center md:text-left">
              <CardTitle className="text-3xl font-bold">{room.name}</CardTitle>
            </div>
          </CardHeader>

          <CardContent className="p-6 grid md:grid-cols-3 gap-6">
            <MembersBlock
              members={members}
              recent={recent}
              regularPlayers={regularPlayers}
              isInviting={isInviting}
              inviteEmail={inviteEmail}
              setInviteEmail={setInviteEmail}
              handleInvite={handleInvite}
              room={room}
            />

            {!latestSeason && (
              <RecordBlock
                members={members}
                player1Id={player1Id}
                player2Id={player2Id}
                setPlayer1Id={setPlayer1Id}
                setPlayer2Id={setPlayer2Id}
                matchesInput={matchesInput}
                setMatchesInput={setMatchesInput}
                addRow={addRow}
                removeRow={removeRow}
                saveMatches={saveMatches}
                isRecording={isRecording}
              />
            )}

            {!latestSeason && (
              <div className="md:col-span-3 text-right">
                <Button variant="destructive" onClick={handleFinishSeason}>
                  Finish Season
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Separator className="my-8" />

        {/* standings */}
        <Card className="shadow-lg mb-8">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle>Standings</CardTitle>
              {latestSeason && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={viewMode === 'regular' ? 'default' : 'outline'}
                    onClick={() => setViewMode('regular')}
                  >
                    Regular
                  </Button>
                  <Button
                    size="sm"
                    variant={viewMode === 'final' ? 'default' : 'outline'}
                    onClick={() => setViewMode('final')}
                  >
                    Final
                  </Button>
                </div>
              )}
            </div>
            <CardDescription>
              {viewMode === 'regular'
                ? 'Live season standings'
                : 'Season awards (final)'}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {/* ───────── REGULAR ───────── */}
            {viewMode === 'regular' && (
              <ScrollArea>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={() =>
                          setSortConfig(s => ({
                            key: 'name',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        Player
                      </TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={() =>
                          setSortConfig(s => ({
                            key: 'rating',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        Room&nbsp;Rating
                      </TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={() =>
                          setSortConfig(s => ({
                            key: 'deltaRoom',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        Room&nbsp;Δ
                      </TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={() =>
                          setSortConfig(s => ({
                            key: 'globalDelta',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        Global&nbsp;Δ
                      </TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={() =>
                          setSortConfig(s => ({
                            key: 'totalMatches',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        Games
                      </TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={() =>
                          setSortConfig(s => ({
                            key: 'wins',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        Wins
                      </TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={() =>
                          setSortConfig(s => ({
                            key: 'losses',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        Losses
                      </TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={() =>
                          setSortConfig(s => ({
                            key: 'winPct',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        Win&nbsp;%
                      </TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={() =>
                          setSortConfig(s => ({
                            key: 'avgPtsPerMatch',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        Avg&nbsp;Δ&nbsp;/&nbsp;Game
                      </TableHead>
                      <TableHead>Last&nbsp;5</TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={() =>
                          setSortConfig(s => ({
                            key: 'longestWinStreak',
                            dir: s.dir === 'asc' ? 'desc' : 'asc',
                          }))
                        }
                      >
                        Best&nbsp;Streak
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {regularPlayers.map((p, i) => (
                      <TableRow key={p.userId}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell>
                          <a
                            href={`/profile/${p.userId}`}
                            className="hover:underline"
                          >
                            {p.name}
                          </a>
                          {p.userId === room.creator && (
                            <Crown className="inline ml-1 h-4 w-4 text-yellow-500" />
                          )}
                        </TableCell>
                        <TableCell>
                          {p.ratingVisible ? p.rating : '—'}
                        </TableCell>
                        <TableCell>
                          {p.ratingVisible ? p.deltaRoom.toFixed(0) : '—'}
                        </TableCell>
                        <TableCell>
                          {p.ratingVisible ? p.globalDelta.toFixed(0) : '—'}
                        </TableCell>
                        <TableCell>{p.totalMatches}</TableCell>
                        <TableCell>{p.wins}</TableCell>
                        <TableCell>{p.losses}</TableCell>
                        <TableCell>
                          {p.ratingVisible ? `${p.winPct}%` : '—'}
                        </TableCell>
                        <TableCell>
                          {p.ratingVisible
                            ? p.avgPtsPerMatch.toFixed(2)
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {p.ratingVisible ? p.last5Form : '—'}
                        </TableCell>
                        <TableCell>
                          {p.ratingVisible ? p.longestWinStreak : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}

            {/* ───────── FINAL ───────── */}
            {viewMode === 'final' && latestSeason && (
              <ScrollArea>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rank</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead>Games</TableHead>
                      <TableHead>Wins</TableHead>
                      <TableHead>Losses</TableHead>
                      <TableHead>Best&nbsp;Streak</TableHead>
                      <TableHead>Start&nbsp;Elo</TableHead>
                      <TableHead>End&nbsp;Elo</TableHead>
                      <TableHead>Total&nbsp;Δ</TableHead>
                      <TableHead>Adjusted&nbsp;Pts</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(Array.isArray(latestSeason.summary)
                      ? latestSeason.summary
                      : latestSeason.members
                    ).map((r: any) => (
                      <TableRow key={r.userId}>
                        <TableCell>{r.place}</TableCell>
                        <TableCell>
                          <a
                            href={`/profile/${r.userId}`}
                            className="hover:underline"
                          >
                            {r.name}
                          </a>
                        </TableCell>
                        <TableCell>{r.matchesPlayed}</TableCell>
                        <TableCell>{r.wins}</TableCell>
                        <TableCell>{r.losses}</TableCell>
                        <TableCell>{r.longestWinStreak ?? '—'}</TableCell>
                        <TableCell>{r.startGlobalElo ?? '—'}</TableCell>
                        <TableCell>{r.endGlobalElo ?? '—'}</TableCell>
                        <TableCell>{r.totalAddedPoints?.toFixed(2) ?? '—'}</TableCell>
                        <TableCell>{r.adjPoints?.toFixed(2) ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}

            {/* ───────── HELP TEXT ───────── */}
            <div className="mt-4 text-xs text-muted-foreground leading-relaxed space-y-1">
              <p>
                <strong>Room Rating</strong> — Elo score, recalculated based only on matches
                in this room (starting = 1000).
              </p>
              <p>
                <strong>Room Δ</strong> — vs. starting (1000): current room
                rating – 1000.
              </p>
              <p>
                <strong>Global Δ</strong> — Change in your overall Elo (across all rooms)
                since your first match this season.
              </p>
              <p>
                <strong>Games / Wins / Losses</strong> — Matches played and outcomes.
              </p>
              <p>
                <strong>Win %</strong> — (Wins / Games) × 100.
              </p>
              <p>
                <strong>Avg Δ / Game</strong> — Average room Elo change per match.
              </p>
              <p>
                <strong>Last 5</strong> — W = win, L = loss for the last five games.
              </p>
              <p>
                <strong>Best Streak</strong> — Longest consecutive winning streak.
              </p>
              {viewMode === 'final' && (
                <>
                  <p>
                    <strong>Total Δ</strong> — Sum of all Elo gains/losses
                    for the season (room-specific).
                  </p>
                  <p>
                    <strong>Adjusted Pts</strong> —<br />
                    <code>
                      Total Δ × √(AvgGames / YourGames)
                    </code>
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* recent matches */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="text-primary" />
              Recent Matches
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length ? (
              <ScrollArea className="h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Players</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Room&nbsp;Δ</TableHead>
                      <TableHead>Elo&nbsp;Δ</TableHead>
                      <TableHead>Winner</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recent.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>
                          {m.player1.name} – {m.player2.name}
                        </TableCell>
                        <TableCell>
                          {m.player1.scores} – {m.player2.scores}
                        </TableCell>
                        <TableCell>
                          {m.player1.roomAddedPoints} | {m.player2.roomAddedPoints}
                        </TableCell>
                        <TableCell>
                          {m.player1.newRating} | {m.player2.newRating}
                        </TableCell>
                        <TableCell className="font-semibold">{m.winner}</TableCell>
                        <TableCell>
                          {safeFormatDate(
                            m.timestamp ?? m.createdAt ?? m.tsIso,
                            'dd.MM.yyyy HH:mm:ss'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            ) : (
              <p className="text-center py-8 text-muted-foreground">No recent matches</p>
            )}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}

/* ------------------------- MembersBlock (unchanged) ------------------------- */
function MembersBlock({
  members,
  recent,
  regularPlayers,
  isInviting,
  inviteEmail,
  setInviteEmail,
  handleInvite,
  room,
}: {
  members: Room['members'];
  recent: Match[];
  regularPlayers: any[];
  isInviting: boolean;
  inviteEmail: string;
  setInviteEmail(v: string): void;
  handleInvite(): void;
  room: Room;
}) {
  const [profiles, setProfiles] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!members.length) return;
    const fetchProfiles = async () => {
      const p: Record<string, any> = {};
      await Promise.all(
        members.map(async (m) => {
          const snap = await getDoc(doc(db, 'users', m.userId));
          if (snap.exists()) p[m.userId] = snap.data();
        }),
      );
      setProfiles(p);
    };
    fetchProfiles();
  }, [members, recent]);

  const lastRoomRating = useMemo(() => {
    const map: Record<string, number> = {};
    members.forEach((mem) => {
      const lastMatch = recent.find((r) => r.player1Id === mem.userId || r.player2Id === mem.userId);
      map[mem.userId] = lastMatch
        ? (lastMatch.player1Id === mem.userId
          ? lastMatch.player1.roomNewRating
          : lastMatch.player2.roomNewRating)
        : mem.rating;
    });
    return map;
  }, [members, recent]);

  return (
    <div>
      <Users className="text-primary" /> <span className="font-semibold">Members ({members.length})</span>
      <ScrollArea className="h-[300px] border rounded-md p-3 bg-background">
        {regularPlayers.map((p) => {
          const prof = profiles[p.userId] || {};
          const globalElo = prof.globalElo ?? '–';
          const elo = globalElo !== '–' ? globalElo : lastRoomRating[p.userId] ?? p.rating ?? '–';
          const rank = prof.rank ?? getRank(Number.isFinite(elo) ? elo : 1000);

          return (
            <div key={p.userId} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md transition-colors">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={prof.photoURL || undefined} />
                  <AvatarFallback>{p.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium leading-none">
                    <a href={`/profile/${p.userId}`} className="hover:underline">
                      {p.name}
                    </a>
                    {p.userId === room.creator && <Crown className="inline ml-1 h-4 w-4 text-yellow-500" />}
                  </p>
                  <p className="text-xs text-muted-foreground">MP {p.totalMatches} · W% {p.winPct}% · ELO {globalElo}</p>
                  <p className="text-[10px] text-muted-foreground">Rank {rank}</p>
                </div>
              </div>
              <span className="text-sm font-semibold text-primary">{p.rating}&nbsp;pts</span>
            </div>
          );
        })}
      </ScrollArea>

      <Dialog>
        <DialogTrigger asChild>
          <Button className="mt-4 w-full" variant="outline" disabled={isInviting}>
            <MailPlus className="mr-2 h-4 w-4" /> Invite Player
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite to {room.name}</DialogTitle>
            <DialogDescription>Enter email</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="invEmail">Email</Label>
            <Input id="invEmail" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button onClick={handleInvite} disabled={isInviting}>
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------- RecordBlock (unchanged) ------------------------- */
function RecordBlock({
  members,
  player1Id,
  player2Id,
  setPlayer1Id,
  setPlayer2Id,
  matchesInput,
  setMatchesInput,
  addRow,
  removeRow,
  saveMatches,
  isRecording,
}: {
  members: Room['members'];
  player1Id: string;
  player2Id: string;
  setPlayer1Id(v: string): void;
  setPlayer2Id(v: string): void;
  matchesInput: { score1: string; score2: string; side1: string; side2: string }[];
  setMatchesInput(v: any): void;
  addRow(): void;
  removeRow(i: number): void;
  saveMatches(): void;
  isRecording: boolean;
}) {
  useEffect(() => {
    if (player1Id && player1Id === player2Id) setPlayer2Id('');
  }, [player1Id, player2Id, setPlayer2Id]);

  const listP1 = members.filter((m) => m.userId !== player2Id).map((m) => ({ userId: m.userId, name: m.name, rating: m.rating }));
  const listP2 = members.filter((m) => m.userId !== player1Id).map((m) => ({ userId: m.userId, name: m.name, rating: m.rating }));

  return (
    <Card className="md:col-span-2 shadow-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sword className="text-accent" /> Record Matches
        </CardTitle>
        <CardDescription>Select players and scores</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 items-end">
          <PlayerSelect label="Player 1" value={player1Id} onChange={setPlayer1Id} list={listP1} />
          <PlayerSelect label="Player 2" value={player2Id} onChange={setPlayer2Id} list={listP2} />
        </div>
        {matchesInput.map((row, i) => (
          <MatchRowInput key={i} index={i} data={row} onChange={(d) => setMatchesInput((r: any) => r.map((v: any, idx: number) => (idx === i ? d : v)))} onRemove={() => removeRow(i)} removable={i > 0} />
        ))}
        <Button variant="outline" className="flex items-center gap-2" onClick={addRow}>
          <Plus /> Add Match
        </Button>
        <Button className="w-full mt-4" disabled={isRecording} onClick={saveMatches}>
          {isRecording ? 'Recording…' : 'Record & Update ELO'}
        </Button>
      </CardContent>
    </Card>
  );
}

function PlayerSelect({ label, value, onChange, list }: { label: string; value: string; onChange(v: string): void; list: { userId: string; name: string; rating: number }[] }) {
  return (
    <div>
      <Label>{label}</Label>
      <select className="w-full border rounded p-2" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select</option>
        {list.map((o) => (
          <option key={o.userId} value={o.userId}>
            {o.name} ({o.rating})
          </option>
        ))}
      </select>
    </div>
  );
}

function MatchRowInput({ index, data, onChange, onRemove, removable }: { index: number; data: any; onChange(d: any): void; onRemove(): void; removable: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-4 mb-2 relative">
      {['1', '2'].map((n) => (
        <div key={n}>
          <Label>{`P${n} Score`}</Label>
          <Input type="number" value={data[`score${n}`]} onChange={(e) => onChange({ ...data, [`score${n}`]: e.target.value })} />
          <Label className="mt-2">Side</Label>
          <select
            className="w-full border rounded p-2"
            value={data[`side${n}`]}
            onChange={(e) =>
              onChange({
                ...data,
                [`side${n}`]: e.target.value,
                [`side${n === '1' ? '2' : '1'}`]: e.target.value === 'left' ? 'right' : 'left',
              })
            }
          >
            <option value="">–</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </div>
      ))}
      {removable && (
        <Button variant="ghost" className="absolute top-1/2 right-0 -translate-y-1/2" onClick={onRemove}>
          <Trash2 />
        </Button>
      )}
    </div>
  );
}

function getRank(elo: number) {
  if (elo < 1001) return 'Ping-Pong Padawan';
  if (elo < 1100) return 'Table-Tennis Trainee';
  if (elo < 1200) return 'Racket Rookie';
  if (elo < 1400) return 'Paddle Prodigy';
  if (elo < 1800) return 'Spin Sensei';
  if (elo < 2000) return 'Smash Samurai';
  return 'Ping-Pong Paladin';
}