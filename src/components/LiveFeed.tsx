// src/components/LiveFeed.tsx
'use client';

import { useAuth } from '@/contexts/AuthContext';
import { Sport, sportConfig } from '@/contexts/SportContext';
import { db } from '@/lib/firebase';
import type { Match } from '@/lib/types';
import { parseFlexDate } from '@/lib/utils/date';
import { formatTimeAgo } from '@/lib/utils/timeAgo';
import {
  collection,
  DocumentSnapshot,
  getDocs,
  limit,
  orderBy,
  query,
  QueryConstraint,
  startAfter,
} from 'firebase/firestore';
import { Loader2, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './ui/card';

type CombinedMatch = Match & {
  sport: Sport;
};

// --- НАЧАЛО ИЗМЕНЕНИЙ: Новая логика K-Way Merge ---

// Количество матчей, отображаемых за раз
const BATCH_SIZE = 5;
// Количество матчей, загружаемых в очередь за раз
const FETCH_LIMIT = 5;

type Cursors = Record<Sport, DocumentSnapshot | null>;
type Queues = Record<Sport, CombinedMatch[]>;
type AllLoaded = Record<Sport, boolean>;

// --- КОНЕЦ ИЗМЕНЕНИЙ ---

const MatchItem: React.FC<{ match: CombinedMatch; t: any }> = ({
  match,
  t,
}) => {
  const config = sportConfig[match.sport];
  const p1Won = match.player1.scores > match.player2.scores;
  const p2Won = match.player2.scores > match.player1.scores;
  const p1 = match.player1;
  const p2 = match.player2;
  const timeAgo = formatTimeAgo(
    match.tsIso ?? match.timestamp ?? match.createdAt,
    t
  );

  p1.id = match.player1Id;
  p2.id = match.player2Id;
  return (
    <div
      className={`flex items-start gap-3 p-3 border-b ${config.theme.border} border-l-4 rounded-r`}
    >
      <div className={`mt-1 ${config.theme.primary}`}>
        {React.cloneElement(config.icon as React.ReactElement, {
          className: 'h-5 w-5',
        })}
      </div>
      <div className='flex-grow text-sm'>
        <div className='flex items-center gap-2'>
          <Link
            href={`/profile/${p1.id}`}
            className='flex items-center gap-1.5 group'
          >
            {/* {console.log(p1)} */}
            <Avatar className='h-5 w-5'>
              <AvatarImage src={p1.photoURL || undefined} />
              <AvatarFallback>{p1.name?.[0]}</AvatarFallback>
            </Avatar>
            <span
              className={`group-hover:underline ${p1Won ? 'font-bold' : ''}`}
            >
              {p1.name}
            </span>
          </Link>
          <span className='text-xs text-muted-foreground'>vs</span>
          <Link
            href={`/profile/${p2.id}`}
            className='flex items-center gap-1.5 group'
          >
            <Avatar className='h-5 w-5'>
              <AvatarImage src={p2.photoURL || undefined} />
              <AvatarFallback>{p2.name?.[0]}</AvatarFallback>
            </Avatar>
            <span
              className={`group-hover:underline ${p2Won ? 'font-bold' : ''}`}
            >
              {p2.name}
            </span>
          </Link>
        </div>
        <div className='flex items-center justify-between mt-1.5'>
          <div
            className={`font-mono text-lg ${
              p1Won ? 'text-green-600' : 'text-destructive'
            }`}
          >
            <span className={p1Won ? 'font-bold' : ''}>{p1.scores}</span>
            <span className='text-muted-foreground'> - </span>
            <span className={p2Won ? 'font-bold' : ''}>{p2.scores}</span>
          </div>
          <span className='text-xs text-muted-foreground'>{timeAgo}</span>
        </div>
      </div>
    </div>
  );
};

// --- НАЧАЛО ИЗМЕНЕНИЙ: Новая логика компонента ---

export const LiveFeed: React.FC = () => {
  const { t } = useTranslation();
  const { userProfile } = useAuth();

  // Видимые матчи
  const [displayedMatches, setDisplayedMatches] = useState<CombinedMatch[]>([]);
  // Очереди (буферы) для каждого вида спорта
  const queuesRef = useRef<Queues>({
    pingpong: [],
    tennis: [],
    badminton: [],
  });
  // Курсоры для пагинации
  const cursorsRef = useRef<Cursors>({
    pingpong: null,
    tennis: null,
    badminton: null,
  });
  // Статус "все загружено" для каждого вида спорта
  const allLoadedRef = useRef<AllLoaded>({
    pingpong: false,
    tennis: false,
    badminton: false,
  });

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fullyLoaded, setFullyLoaded] = useState(false); // Все 3 источника исчерпаны

  // Ref для предотвращения двойных нажатий "Load More"
  const isLoadingMoreRef = useRef(false);
  // Ref для отслеживания первой загрузки
  const hasLoadedInitialRef = useRef(false);

  // Стабильная функция для загрузки данных из ОДНОЙ коллекции
  const fetchQueue = useCallback(
    async (sport: Sport, cursor: DocumentSnapshot | null) => {
      if (allLoadedRef.current[sport])
        return { matches: [], cursor, allLoaded: true };
      try {
        const collectionName = sportConfig[sport].collections.matches;
        const constraints: QueryConstraint[] = [
          orderBy('tsIso', 'desc'),
          limit(FETCH_LIMIT),
        ];
        if (cursor) {
          constraints.push(startAfter(cursor));
        }
        const q = query(collection(db, collectionName), ...constraints);
        const snap = await getDocs(q);

        if (snap.empty) {
          return { matches: [], cursor, allLoaded: true };
        }

        const newMatches = snap.docs.map((doc) => ({
          ...(doc.data() as Match),
          id: doc.id,
          sport: sport,
        }));
        const newCursor = snap.docs[snap.docs.length - 1];
        return {
          matches: newMatches,
          cursor: newCursor,
          allLoaded: snap.size < FETCH_LIMIT,
        };
      } catch (e) {
        console.warn(`Failed to fetch ${sport}`, e);
        return { matches: [], cursor, allLoaded: true }; // При ошибке считаем, что все загружено
      }
    },
    []
  );

  // Главная функция: берет 5 матчей из очередей, пополняя их при необходимости
  const loadNextBatch = useCallback(
    async (isInitialLoad = false) => {
      // Блокировка для предотвращения двойной загрузки
      if (isLoadingMoreRef.current) return;
      isLoadingMoreRef.current = true;

      if (isInitialLoad) {
        setLoading(true);
        // Сброс всего состояния
        setDisplayedMatches([]);
        queuesRef.current = { pingpong: [], tennis: [], badminton: [] };
        cursorsRef.current = { pingpong: null, tennis: null, badminton: null };
        allLoadedRef.current = {
          pingpong: false,
          tennis: false,
          badminton: false,
        };
        setFullyLoaded(false);
      } else {
        setLoadingMore(true);
      }

      // 1. Пополняем *все* пустые очереди
      const fetches: Promise<any>[] = [];
      const sports: Sport[] = ['pingpong', 'tennis', 'badminton'];
      for (const sport of sports) {
        if (
          queuesRef.current[sport].length === 0 &&
          !allLoadedRef.current[sport]
        ) {
          fetches.push(fetchQueue(sport, cursorsRef.current[sport]));
        }
      }

      if (fetches.length > 0) {
        const results = await Promise.all(fetches);
        for (const result of results) {
          if (!result) continue;
          // Находим, какой спорт вернул результат (немного костыль)
          const sport = result.matches[0]?.sport;
          if (!sport) {
            // Это мог быть пустой массив от fetchQueue, нужно проверить все
            if (!allLoadedRef.current.pingpong && result.allLoaded)
              allLoadedRef.current.pingpong = true;
            if (!allLoadedRef.current.tennis && result.allLoaded)
              allLoadedRef.current.tennis = true;
            if (!allLoadedRef.current.badminton && result.allLoaded)
              allLoadedRef.current.badminton = true;
            continue;
          }

          queuesRef.current[sport] = [
            ...queuesRef.current[sport],
            ...result.matches,
          ];
          cursorsRef.current[sport] = result.cursor;
          allLoadedRef.current[sport] = result.allLoaded;
        }
      }

      // 2. K-Way Merge: Выбираем 5 лучших (новейших) матчей
      const newBatch: CombinedMatch[] = [];
      for (let i = 0; i < BATCH_SIZE; i++) {
        let bestMatch: CombinedMatch | null = null;
        let bestSport: Sport | null = null;
        let bestDate = 0;

        // Ищем кандидата из каждой очереди
        for (const sport of sports) {
          const candidate = queuesRef.current[sport][0];
          if (candidate) {
            const candidateDate = parseFlexDate(
              candidate.tsIso ?? candidate.timestamp ?? candidate.createdAt
            ).getTime();
            if (candidateDate > bestDate) {
              bestDate = candidateDate;
              bestMatch = candidate;
              bestSport = sport;
            }
          }
        }

        if (bestMatch && bestSport) {
          // Нашли победителя
          newBatch.push(bestMatch);
          // Удаляем победителя из его очереди
          queuesRef.current[bestSport].shift();
        } else {
          // Если bestMatch не найден, значит все очереди пусты
          setFullyLoaded(true);
          break; // Выходим из цикла for
        }
      }

      // 3. Обновляем состояние
      setDisplayedMatches((prev) => [...prev, ...newBatch]);

      if (isInitialLoad) {
        setLoading(false);
      } else {
        setLoadingMore(false);
      }
      isLoadingMoreRef.current = false;
    },
    [fetchQueue] // fetchQueue - стабилен
  );

  // Начальная загрузка
  useEffect(() => {
    if (userProfile && !hasLoadedInitialRef.current) {
      hasLoadedInitialRef.current = true;
      loadNextBatch(true);
    }
  }, [userProfile, loadNextBatch]);

  const handleRefresh = () => {
    hasLoadedInitialRef.current = true; // Считаем, что "загружено"
    loadNextBatch(true); // Вызываем полную перезагрузку
  };

  const handleLoadMore = () => {
    loadNextBatch(false); // Вызываем дозагрузку
  };

  return (
    <Card className='shadow-lg'>
      <CardHeader className='flex flex-row items-center justify-between'>
        <div>
          <CardTitle>{t('Live Match Feed')}</CardTitle>
          <CardDescription>
            {t('Latest matches from public rooms')}
          </CardDescription>
        </div>
        <Button
          variant='ghost'
          size='icon'
          onClick={handleRefresh}
          disabled={loading || loadingMore}
          aria-label={t('Refresh feed')}
        >
          <RefreshCw
            className={`h-4 w-4 ${
              loading || loadingMore ? 'animate-spin' : ''
            }`}
          />
        </Button>
      </CardHeader>
      <CardContent className='space-y-4'>
        {loading ? (
          <div className='flex justify-center items-center py-10'>
            <Loader2 className='h-8 w-8 animate-spin text-primary' />
          </div>
        ) : displayedMatches.length === 0 ? (
          <p className='text-center text-muted-foreground py-10'>
            {t('No public matches found yet.')}
          </p>
        ) : (
          displayedMatches.map((match) => (
            <MatchItem key={`${match.sport}-${match.id}`} match={match} t={t} />
          ))
        )}
      </CardContent>
      {/* Кнопка "Load More" */}
      {!loading && !fullyLoaded && (
        <CardFooter>
          <Button
            variant='outline'
            className='w-full'
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : null}
            {t('Load More')}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
};

export default LiveFeed;
