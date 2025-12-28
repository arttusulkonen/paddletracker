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
import {
	collection,
	doc,
	getDoc,
	onSnapshot,
	orderBy,
	query,
	where,
} from 'firebase/firestore';
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
  const { config, sport } = useSport();
  const [members, setMembers] = React.useState<any[]>(initialMembers);
  const [matches, setMatches] = React.useState<any[]>([]);
  const [profiles, setProfiles] = React.useState<Record<string, any>>({});
  const [loading, setLoading] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<ViewMode>('regular');

  React.useEffect(() => {
    setMembers(initialMembers);
  }, [initialMembers]);

  React.useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(
      doc(db!, config.collections.rooms, roomId),
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

  React.useEffect(() => {
    const q = query(
      collection(db!, config.collections.matches),
      where('roomId', '==', roomId),
      orderBy('tsIso', 'asc')
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

  React.useEffect(() => {
    const ids = (members ?? []).map((m: any) => m.userId).filter(Boolean);
    if (ids.length === 0) {
      setProfiles({});
      return;
    }
    Promise.all(ids.map((id: string) => getDoc(doc(db!, 'users', id)))).then(
      (snaps) => {
        const map: Record<string, any> = {};
        snaps.forEach((s) => {
          if (s.exists()) map[s.id] = { uid: s.id, ...(s.data() as any) };
        });
        setProfiles(map);
      }
    );
  }, [members]);

  const computed = React.useMemo(() => {
    const arr = Array.isArray(members) ? members : [];
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

      if (m.player1?.roomNewRating != null)
        latestRoomRatings[p1] = Number(m.player1.roomNewRating);
      if (m.player2?.roomNewRating != null)
        latestRoomRatings[p2] = Number(m.player2.roomNewRating);
    });

    const activePlayers = arr.filter((p: any) => {
      const ms = matchStats[p.userId];
      const w = ms?.wins ?? Number(p.wins ?? 0);
      const l = ms?.losses ?? Number(p.losses ?? 0);
      return w + l > 0;
    });

    const totalMatchesAll = activePlayers.reduce((sum, p) => {
      const ms = matchStats[p.userId];
      const w = ms?.wins ?? Number(p.wins ?? 0);
      const l = ms?.losses ?? Number(p.losses ?? 0);
      return sum + w + l;
    }, 0);

    const avgM =
      activePlayers.length > 0 ? totalMatchesAll / activePlayers.length : 1;

    const adjFactor = (ratio: number) => {
      if (!isFinite(ratio) || ratio <= 0) return 0;
      return Math.sqrt(ratio);
    };

    return arr.map((p: any) => {
      const ms = matchStats[p.userId];
      const wins = ms?.wins ?? Number(p.wins ?? 0);
      const losses = ms?.losses ?? Number(p.losses ?? 0);
      const totalMatches = wins + losses;

      const rating = latestRoomRatings[p.userId] ?? Number(p.rating ?? 1000);

      const prof = profiles[p.userId];
      const sportElo = prof?.sports?.[sport]?.globalElo;
      const globalEloNum =
        Number.isFinite(sportElo) && sportElo !== undefined
          ? Number(sportElo)
          : Number.isFinite(p.globalElo)
          ? Number(p.globalElo)
          : Number.isFinite(rating)
          ? Number(rating)
          : 1000;

      const winPct =
        totalMatches > 0 ? ((wins / totalMatches) * 100).toFixed(1) : '0.0';

      const totalAddedPoints = rating - 1000;

      return {
        ...p,
        name: prof?.name ?? prof?.displayName ?? p.name ?? '—',
        photoURL: prof?.photoURL ?? p.photoURL,
        rating,
        ratingVisible: totalMatches >= 1,
        globalEloNum,
        wins,
        losses,
        totalMatches,
        winPct: Number(winPct),
        totalAddedPoints,
        adjPointsLive: totalAddedPoints * adjFactor(totalMatches / avgM),
      };
    });
  }, [members, matches, profiles, sport]);

  const sorted = React.useMemo(() => {
    if (viewMode === 'regular') {
      return [...computed].sort((a, b) => {
        if (a.ratingVisible !== b.ratingVisible)
          return a.ratingVisible ? -1 : 1;
        if (b.rating !== a.rating) return (b.rating ?? 0) - (a.rating ?? 0);
        return (b.totalMatches ?? 0) - (a.totalMatches ?? 0);
      });
    }
    return [...computed].sort((a, b) => {
      const aZero = (a.totalMatches ?? 0) === 0;
      const bZero = (b.totalMatches ?? 0) === 0;
      if (aZero !== bZero) return aZero ? 1 : -1;

      if (b.adjPointsLive !== a.adjPointsLive)
        return (b.adjPointsLive ?? 0) - (a.adjPointsLive ?? 0);
      if (b.rating !== a.rating) return (b.rating ?? 0) - (a.rating ?? 0);
      return (b.winPct ?? 0) - (a.winPct ?? 0);
    });
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
                  ? 'bg-green-100 text-green-700 hover:bg-green-100 border-green-200'
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
          <ScrollArea className='border rounded-md p-2 bg-background max-h-[60vh] overflow-auto'>
            {sorted.map((p: any, index: number) => {
              const rightValue =
                viewMode === 'regular'
                  ? p.ratingVisible && typeof p.rating === 'number'
                    ? `${Math.round(p.rating)} ${t('pts')}`
                    : '—'
                  : (p.totalMatches ?? 0) === 0
                  ? '—'
                  : `${(p.adjPointsLive ?? 0).toFixed(1)} ${t('adj')}`;
              const rank = getRank(p.globalEloNum ?? 1000, t);

              return (
                <div
                  key={p.userId}
                  className='flex items-center justify-between p-2 hover:bg-muted/50 rounded-md transition-colors'
                >
                  <div className='flex items-center gap-3 min-w-0'>
                    {viewMode === 'liveFinal' && (
                      <div
                        className={`w-4 text-center font-mono text-xs font-bold ${
                          index < 3 ? 'text-amber-500' : 'text-muted-foreground'
                        }`}
                      >
                        {index + 1}
                      </div>
                    )}
                    <Avatar className='h-10 w-10'>
                      <AvatarImage src={p.photoURL || undefined} />
                      <AvatarFallback>
                        {(p.name || '?').charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className='min-w-0'>
                      <div className='font-medium leading-none truncate flex items-center gap-2'>
                        {p.name}
                      </div>
                      <p className='text-xs text-muted-foreground truncate mt-1'>
                        {t('MP')} {p.totalMatches ?? 0} · {t('W%')} {p.winPct}%
                        · {t('ELO')} {(p.globalEloNum ?? 0).toFixed(0)}
                        {viewMode === 'liveFinal' && (
                          <>
                            {' '}
                            · Δ{' '}
                            {Number(p.totalAddedPoints ?? 0) >= 0
                              ? `+${Math.round(p.totalAddedPoints)}`
                              : Math.round(p.totalAddedPoints)}
                          </>
                        )}
                      </p>
                      <p className='text-[10px] text-muted-foreground truncate'>
                        {rank}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-semibold text-right w-24 flex-shrink-0 ${
                      viewMode === 'liveFinal'
                        ? 'text-green-700'
                        : 'text-primary'
                    }`}
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
