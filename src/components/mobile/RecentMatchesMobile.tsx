'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ScrollArea,
} from '@/components/ui';
import { useSport } from '@/contexts/SportContext';
import { db } from '@/lib/firebase';
import type { Match } from '@/lib/types';
import { safeFormatDate } from '@/lib/utils/date';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import React from 'react';
import { useTranslation } from 'react-i18next';

type Props = {
  roomId: string;
  members?: Array<{ userId: string; name?: string }>;
};

export function RecentMatchesMobile({ roomId, members = [] }: Props) {
  const { t } = useTranslation();
  const { config } = useSport();
  const [matches, setMatches] = React.useState<Match[]>([]);
  const [loading, setLoading] = React.useState(true);

  const nameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) if (m?.userId) map.set(m.userId, m.name ?? '');
    return map;
  }, [members]);

  React.useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, config.collections.matches),
      where('roomId', '==', roomId)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Match));
        const sorted = all.sort((a, b) => tsToMs(b) - tsToMs(a));
        const withNames = sorted.map((m) => ({
          ...m,
          player1: {
            ...m.player1,
            name: nameById.get(m.player1Id) ?? m.player1?.name,
          },
          player2: {
            ...m.player2,
            name: nameById.get(m.player2Id) ?? m.player2?.name,
          },
        }));
        setMatches(withNames);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [roomId, config.collections.matches, nameById]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-xl'>{t('Recent Matches')}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className='py-6 text-center'>{t('Loading…')}</div>
        ) : matches.length === 0 ? (
          <p className='py-4 text-center text-muted-foreground'>
            {t('No recent matches')}
          </p>
        ) : (
          <ScrollArea className='border rounded-md bg-background'>
            <ul className='divide-y'>
              {matches.map((m) => {
                const p1 = m.player1;
                const p2 = m.player2;
                const d1 = roomDelta(p1);
                const d2 = roomDelta(p2);

                const winnerId =
                  Number(p1?.scores ?? 0) > Number(p2?.scores ?? 0)
                    ? m.player1Id
                    : m.player2Id;

                const dateStr = safeFormatDate(
                  (m as any).tsIso ??
                    (m as any).timestamp ??
                    (m as any).createdAt,
                  'dd.MM HH:mm'
                );

                return (
                  <li key={m.id} className='flex items-center gap-3 px-3 py-2'>
                    <div className='min-w-0 flex-1'>
                      <div className='font-medium truncate'>
                        <span
                          className={
                            winnerId === m.player1Id ? 'font-semibold' : ''
                          }
                        >
                          {p1?.name}
                        </span>{' '}
                        <span className='text-muted-foreground'>vs</span>{' '}
                        <span
                          className={
                            winnerId === m.player2Id ? 'font-semibold' : ''
                          }
                        >
                          {p2?.name}
                        </span>
                      </div>

                      <div className='text-xs text-muted-foreground'>
                        {p1?.scores} – {p2?.scores} · Δ {fmtDelta(d1)} |{' '}
                        {fmtDelta(d2)}
                      </div>
                    </div>

                    <div className='text-xs text-muted-foreground whitespace-nowrap'>
                      {dateStr}
                    </div>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function tsToMs(m: any): number {
  const v =
    m?.tsIso ??
    m?.timestamp ??
    (typeof m?.createdAt === 'string' ? m.createdAt : undefined);
  const ms = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

function roomDelta(p: any): number {
  const num = (x: any, fb = NaN) =>
    typeof x === 'number' && Number.isFinite(x) ? x : fb;

  const dRoom = num(p?.roomNewRating, NaN) - num(p?.roomOldRating, NaN);
  if (Number.isFinite(dRoom)) return dRoom;

  const dGlobal = num(p?.newRating, NaN) - num(p?.oldRating, NaN);
  if (Number.isFinite(dGlobal)) return dGlobal;

  const roomAdded = num(p?.roomAddedPoints, NaN);
  if (Number.isFinite(roomAdded)) return roomAdded;

  return 0;
}

function fmtDelta(d: number) {
  const r = Math.round(d);
  return r >= 0 ? `+${r}` : `${r}`;
}
