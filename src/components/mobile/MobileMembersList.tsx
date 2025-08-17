'use client';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ScrollArea,
} from '@/components/ui';
import { useSport } from '@/contexts/SportContext';
import { db } from '@/lib/firebase';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { Users } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type ViewMode = 'regular' | 'liveFinal';

interface MobileMembersListProps {
  roomId: string;
  initialMembers?: any[];
}

function getRank(elo: number, t: (k: string) => string) {
  if (elo < 1001) return t('Ping-Pong Padawan');
  if (elo < 1100) return t('Table-Tennis Trainee');
  if (elo < 1200) return t('Racket Rookie');
  if (elo < 1400) return t('Paddle Prodigy');
  if (elo < 1800) return t('Spin Sensei');
  if (elo < 2000) return t('Smash Samurai');
  return t('Ping-Pong Paladin');
}

export function MobileMembersList({
  roomId,
  initialMembers = [],
}: MobileMembersListProps) {
  const { t } = useTranslation();
  const { config } = useSport(); // важное: config зависит от активного спорта
  const [members, setMembers] = React.useState<any[]>(initialMembers);
  const [matches, setMatches] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<ViewMode>('regular');

  // 1) live подписка на комнату текущего спорта
  React.useEffect(() => {
    setMembers(initialMembers);
  }, [initialMembers]);

  React.useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(
      doc(db, config.collections.rooms, roomId),
      (snap) => {
        if (snap.exists()) {
          const ms = (snap.data().members ?? []) as any[];
          setMembers(ms);
        }
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [roomId, config.collections.rooms]);

  // 2) live подписка на матчи текущего спорта (как на десктопе)
  React.useEffect(() => {
    const q = query(
      collection(db, config.collections.matches),
      where('roomId', '==', roomId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
        setMatches(all);
      },
      () => {}
    );
    return () => unsub();
  }, [roomId, config.collections.matches]);

  // 3) синхронизация статистики по матчам (wins/losses, rating, MP, adj)
  const computed = React.useMemo(() => {
    const arr = Array.isArray(members) ? members : [];

    // посчитаем победы/поражения и последний room-rating по матчам
    const matchStats: Record<string, { wins: number; losses: number }> = {};
    const latestRoomRatings: Record<string, number> = {};

    matches.forEach((m) => {
      const p1 = m.player1Id as string;
      const p2 = m.player2Id as string;
      const p1Score = Number(m.player1?.scores ?? m.player1?.score ?? 0);
      const p2Score = Number(m.player2?.scores ?? m.player2?.score ?? 0);
      const winner = p1Score > p2Score ? p1 : p2;

      [p1, p2].forEach((id) => {
        if (!matchStats[id]) matchStats[id] = { wins: 0, losses: 0 };
        if (id === winner) matchStats[id].wins++;
        else matchStats[id].losses++;
      });

      // последние рейтинги внутри комнаты
      if (m.player1?.roomNewRating != null)
        latestRoomRatings[p1] = Number(m.player1.roomNewRating);
      if (m.player2?.roomNewRating != null)
        latestRoomRatings[p2] = Number(m.player2.roomNewRating);
    });

    // вычислим среднее MP — нужно для adj
    const rawTotals = arr.map((p: any) => {
      const ms = matchStats[p.userId];
      const wins = ms?.wins ?? Number(p.wins ?? 0);
      const losses = ms?.losses ?? Number(p.losses ?? 0);
      return wins + losses;
    });
    const avgM =
      rawTotals.reduce((s, v) => s + (v || 0), 0) / (rawTotals.length || 1) ||
      0.000001;

    const adj = (deltaRoom: number, totalMatches: number) => {
      const ratio = totalMatches / avgM;
      const factor = !isFinite(ratio) || ratio <= 0 ? 0 : Math.sqrt(ratio);
      return deltaRoom * factor;
    };

    return arr.map((p: any) => {
      const ms = matchStats[p.userId];
      const wins = ms?.wins ?? Number(p.wins ?? 0);
      const losses = ms?.losses ?? Number(p.losses ?? 0);
      const totalMatches = wins + losses;

      // возьмём самый свежий room-rating (если есть), иначе из member
      const rating = latestRoomRatings[p.userId] ?? Number(p.rating ?? 1000);

      const ratingVisible =
        typeof p.ratingVisible === 'boolean' ? p.ratingVisible : true;

      // ELO для ранга: globalElo → rating → 1000
      const globalEloNum = Number.isFinite(p.globalElo)
        ? Number(p.globalElo)
        : Number.isFinite(rating)
        ? Number(rating)
        : 1000;

      const winPct =
        totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0;

      // Δ внутри комнаты (если сервер не хранит deltaRoom — считаем от 1000)
      const deltaRoom =
        Number.isFinite(p.deltaRoom) && p.deltaRoom !== null
          ? Number(p.deltaRoom)
          : rating - 1000;

      return {
        ...p,
        name: p.name ?? '—',
        rating,
        ratingVisible,
        globalEloNum,
        wins,
        losses,
        totalMatches,
        winPct,
        deltaRoom,
        adjPointsLive: adj(deltaRoom, totalMatches),
      };
    });
  }, [members, matches]);

  const sorted = React.useMemo(() => {
    if (viewMode === 'regular') {
      return [...computed].sort((a, b) => {
        if (a.ratingVisible !== b.ratingVisible)
          return a.ratingVisible ? -1 : 1;
        return (b.rating ?? 0) - (a.rating ?? 0);
      });
    }
    return [...computed].sort(
      (a, b) => (b.adjPointsLive ?? 0) - (a.adjPointsLive ?? 0)
    );
  }, [computed, viewMode]);

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <CardTitle className='text-xl flex items-center gap-2'>
            <Users className='h-5 w-5' /> {t('Members')} ({members.length})
          </CardTitle>

          <div className='flex gap-2'>
            <Button
              size='sm'
              variant={viewMode === 'regular' ? 'default' : 'outline'}
              onClick={() => setViewMode('regular')}
            >
              {t('Regular')}
            </Button>
            <Button
              size='sm'
              variant={viewMode === 'liveFinal' ? 'default' : 'outline'}
              onClick={() => setViewMode('liveFinal')}
              className={
                viewMode === 'liveFinal'
                  ? 'bg-green-100 text-green-700 hover:bg-green-100'
                  : ''
              }
            >
              <span className='inline-flex items-center gap-1'>
                <span className='inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse' />
                {t('Live Final')}
              </span>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className='text-center py-6'>{t('Loading…')}</div>
        ) : (
          <ScrollArea className='border rounded-md p-2 bg-background max-h-[60vh]'>
            {sorted.map((p: any) => {
              const rightValue =
                viewMode === 'regular'
                  ? p.ratingVisible && typeof p.rating === 'number'
                    ? `${Math.round(p.rating)} ${t('pts')}`
                    : '—'
                  : `${(p.adjPointsLive ?? 0).toFixed(2)} ${t('adj')}`;

              const rank = getRank(p.globalEloNum ?? 1000, t);

              return (
                <div
                  key={p.userId}
                  className='flex items-center justify-between p-2 hover:bg-muted/50 rounded-md transition-colors'
                >
                  <div className='flex items-center gap-3 min-w-0'>
                    <Avatar className='h-10 w-10'>
                      <AvatarImage src={p.photoURL || undefined} />
                      <AvatarFallback>
                        {(p.name || '?').charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className='min-w-0'>
                      <div className='font-medium leading-none truncate'>
                        {p.name}
                        {viewMode === 'liveFinal' && (
                          <span className='ml-2 text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded'>
                            LIVE
                          </span>
                        )}
                      </div>

                      <p className='text-xs text-muted-foreground truncate'>
                        {t('MP')} {p.totalMatches ?? 0} · {t('W%')} {p.winPct}%
                        · {t('ELO')} {(p.globalEloNum ?? 0).toFixed(0)}
                        {viewMode === 'liveFinal' && (
                          <>
                            {' '}
                            · Δ{' '}
                            {Number(p.deltaRoom ?? 0) >= 0
                              ? `+${Math.round(p.deltaRoom)}`
                              : Math.round(p.deltaRoom)}
                          </>
                        )}
                      </p>

                      <p className='text-[10px] text-muted-foreground truncate'>
                        {t('Rank')} {rank}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`text-sm font-semibold text-right w-24 flex-shrink-0 ${
                      viewMode === 'liveFinal'
                        ? 'text-green-700'
                        : 'text-primary'
                    }`}
                    title={
                      viewMode === 'liveFinal'
                        ? t(
                            'Adjusted Pts = RoomΔ × √(Games / AvgGames). Live preview of season-final metric.'
                          )
                        : t('Room Rating within this room (starts at 1000).')
                    }
                  >
                    {rightValue}
                  </span>
                </div>
              );
            })}
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
