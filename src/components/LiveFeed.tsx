'use client';

import { useAuth } from '@/contexts/AuthContext';
import { Sport, sportConfig, useSport } from '@/contexts/SportContext';
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
	where,
} from 'firebase/firestore';
import { Building2, Loader2, RefreshCw } from 'lucide-react';
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

// Batch size for displaying matches
const BATCH_SIZE = 5;
// Fetch limit for querying firestore
const FETCH_LIMIT = 10;

type Cursors = Record<Sport, DocumentSnapshot | null>;
type Queues = Record<Sport, CombinedMatch[]>;
type AllLoaded = Record<Sport, boolean>;

const MatchItem: React.FC<{
  match: CombinedMatch;
  t: any;
  communityName?: string;
}> = ({ match, t, communityName }) => {
  const config = sportConfig[match.sport];
  const p1Won = match.player1.scores > match.player2.scores;
  const p2Won = match.player2.scores > match.player1.scores;
  const p1 = match.player1;
  const p2 = match.player2;
  const timeAgo = formatTimeAgo(
    match.tsIso ?? match.timestamp ?? match.createdAt,
    t
  );

  const p1Id = match.player1Id;
  const p2Id = match.player2Id;

  return (
    <div
      className={`relative flex flex-col gap-2 p-3 border-b ${config.theme.border} border-l-4 rounded-r bg-card/50 hover:bg-accent/5 transition-colors`}
    >
      {/* Community Badge */}
      {communityName && (
        <div className='absolute top-2 right-2 flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold bg-muted/80 px-2 py-0.5 rounded-full z-10 max-w-[40%]'>
          <Building2 className='h-3 w-3 shrink-0' />
          <span className='truncate'>{communityName}</span>
        </div>
      )}

      <div className='flex items-start gap-3 mt-1 pt-4 sm:pt-1'>
        <div className={`mt-1 ${config.theme.primary}`}>
          {React.cloneElement(config.icon as React.ReactElement, {
            className: 'h-5 w-5',
          })}
        </div>
        <div className='flex-grow text-sm'>
          <div className='flex items-center gap-2 mt-1'>
            <Link
              href={`/profile/${p1Id}`}
              className='flex items-center gap-1.5 group'
            >
              <Avatar className='h-5 w-5'>
                <AvatarImage src={p1.photoURL || undefined} />
                <AvatarFallback className='text-[10px]'>
                  {p1.name?.[0]}
                </AvatarFallback>
              </Avatar>
              <span
                className={`group-hover:underline ${p1Won ? 'font-bold' : ''}`}
              >
                {p1.name}
              </span>
            </Link>
            <span className='text-xs text-muted-foreground'>vs</span>
            <Link
              href={`/profile/${p2Id}`}
              className='flex items-center gap-1.5 group'
            >
              <Avatar className='h-5 w-5'>
                <AvatarImage src={p2.photoURL || undefined} />
                <AvatarFallback className='text-[10px]'>
                  {p2.name?.[0]}
                </AvatarFallback>
              </Avatar>
              <span
                className={`group-hover:underline ${p2Won ? 'font-bold' : ''}`}
              >
                {p2.name}
              </span>
            </Link>
          </div>
          <div className='flex items-center justify-between mt-2'>
            <div
              className={`font-mono text-lg ${
                p1Won
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-destructive'
              }`}
            >
              <span className={p1Won ? 'font-bold' : ''}>{p1.scores}</span>
              <span className='text-muted-foreground mx-1'>-</span>
              <span className={p2Won ? 'font-bold' : ''}>{p2.scores}</span>
            </div>
            <span className='text-xs text-muted-foreground'>{timeAgo}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const LiveFeed: React.FC = () => {
  const { t } = useTranslation();
  const { user, userProfile } = useAuth();
  const { config } = useSport();

  const [visibleRoomIds, setVisibleRoomIds] = useState<string[]>([]);
  const [roomsReady, setRoomsReady] = useState(false);
  const [roomToCommunityMap, setRoomToCommunityMap] = useState<
    Record<string, string>
  >({});

  const [displayedMatches, setDisplayedMatches] = useState<CombinedMatch[]>([]);

  const queuesRef = useRef<Queues>({
    pingpong: [],
    tennis: [],
    badminton: [],
  });
  const cursorsRef = useRef<Cursors>({
    pingpong: null,
    tennis: null,
    badminton: null,
  });
  const allLoadedRef = useRef<AllLoaded>({
    pingpong: false,
    tennis: false,
    badminton: false,
  });

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fullyLoaded, setFullyLoaded] = useState(false);

  const isLoadingMoreRef = useRef(false);
  const hasLoadedInitialRef = useRef(false);

  const sports: Sport[] = ['pingpong', 'tennis', 'badminton'];

  const loadVisibleRoomsAndCommunities = useCallback(async () => {
    if (!user || !config || !db) return;

    // 1. Build Community Map first (Global)
    const tempMap: Record<string, string> = {};
    try {
      const communitiesSnap = await getDocs(collection(db, 'communities'));
      communitiesSnap.forEach((doc) => {
        const data = doc.data();
        const cName = data.name;
        const rooms = data.roomIds || [];
        if (Array.isArray(rooms)) {
          rooms.forEach((rid) => {
            if (typeof rid === 'string') {
              tempMap[rid] = cName;
            }
          });
        }
      });
    } catch (e) {
      console.error("Failed to load communities", e);
    }

    // 2. Identify Visible Rooms
    let allVisibleIds = new Set<string>();
    const roomCollections = sports.map((s) => sportConfig[s].collections.rooms);

    for (const collectionName of roomCollections) {
      // Public Rooms
      const qPublic = query(
        collection(db, collectionName),
        where('isPublic', '==', true)
      );
      const snapPublic = await getDocs(qPublic);
      snapPublic.docs.forEach((doc) => {
        allVisibleIds.add(doc.id);
        // Fallback: If room doc has communityName and we missed it from 'communities'
        const rData = doc.data();
        if (rData.communityName && !tempMap[doc.id]) {
            tempMap[doc.id] = rData.communityName;
        }
      });

      // Member Rooms
      const qMember = query(
        collection(db, collectionName),
        where('isPublic', '!=', true),
        where('memberIds', 'array-contains', user.uid)
      );
      const snapMember = await getDocs(qMember);
      snapMember.docs.forEach((doc) => {
        allVisibleIds.add(doc.id);
        // Fallback
        const rData = doc.data();
        if (rData.communityName && !tempMap[doc.id]) {
            tempMap[doc.id] = rData.communityName;
        }
      });
    }

    setRoomToCommunityMap(tempMap);

    if (allVisibleIds.size === 0) {
      setVisibleRoomIds(['NO_VISIBLE_ROOMS']);
    } else {
      setVisibleRoomIds(Array.from(allVisibleIds));
    }
    setRoomsReady(true);
  }, [user, config]);

  useEffect(() => {
    if (user && config && !roomsReady) {
      loadVisibleRoomsAndCommunities();
    }
  }, [user, config, roomsReady, loadVisibleRoomsAndCommunities]);

  const fetchQueue = useCallback(
    async (
      sport: Sport,
      cursor: DocumentSnapshot | null,
      roomIds: string[]
    ) => {
      if (allLoadedRef.current[sport] || roomIds.length === 0)
        return { matches: [], cursor, allLoaded: true };

      try {
        const collectionName = sportConfig[sport].collections.matches;
        const chunkedRoomIds = roomIds.slice(0, 10);

        if (chunkedRoomIds.length === 0) {
          return { matches: [], cursor, allLoaded: true };
        }

        const constraints: QueryConstraint[] = [
          where('roomId', 'in', chunkedRoomIds),
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
        return { matches: [], cursor, allLoaded: true };
      }
    },
    []
  );

  const loadNextBatch = useCallback(
    async (isInitialLoad = false) => {
      if (isLoadingMoreRef.current || !roomsReady) return;
      isLoadingMoreRef.current = true;

      if (isInitialLoad) {
        setLoading(true);
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

      const fetches: Promise<any>[] = [];
      for (const sport of sports) {
        if (
          queuesRef.current[sport].length === 0 &&
          !allLoadedRef.current[sport]
        ) {
          fetches.push(
            fetchQueue(sport, cursorsRef.current[sport], visibleRoomIds)
          );
        }
      }

      let anyFetched = false;
      if (fetches.length > 0) {
        const results = await Promise.all(fetches);
        for (const result of results) {
          if (!result || result.matches.length === 0) {
            continue;
          }
          anyFetched = true;
          const sport = result.matches[0]?.sport;
          if (sport) {
            queuesRef.current[sport] = [
              ...queuesRef.current[sport],
              ...result.matches,
            ];
            cursorsRef.current[sport] = result.cursor;
            allLoadedRef.current[sport] = result.allLoaded;
          }
        }
      }

      const remainingInQueues = sports.some(
        (s) => queuesRef.current[s].length > 0
      );
      const remainingToLoad = sports.some((s) => !allLoadedRef.current[s]);

      if (!remainingInQueues && !remainingToLoad && !anyFetched) {
        setFullyLoaded(true);
      }

      const newBatch: CombinedMatch[] = [];
      for (let i = 0; i < BATCH_SIZE; i++) {
        let bestMatch: CombinedMatch | null = null;
        let bestSport: Sport | null = null;
        let bestDate = 0;

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
          newBatch.push(bestMatch);
          queuesRef.current[bestSport].shift();
        } else {
          setFullyLoaded(true);
          break;
        }
      }

      setDisplayedMatches((prev) => [...prev, ...newBatch]);

      if (isInitialLoad) setLoading(false);
      else setLoadingMore(false);

      isLoadingMoreRef.current = false;
    },
    [fetchQueue, visibleRoomIds, roomsReady]
  );

  useEffect(() => {
    if (userProfile && roomsReady && !hasLoadedInitialRef.current) {
      hasLoadedInitialRef.current = true;
      loadNextBatch(true);
    }
  }, [userProfile, roomsReady, loadNextBatch]);

  const handleRefresh = () => {
    setRoomsReady(false);
    hasLoadedInitialRef.current = false;
    loadVisibleRoomsAndCommunities();
  };

  return (
    <Card className='shadow-lg border-none'>
      <CardHeader className='flex flex-row items-center justify-between pb-2'>
        <div>
          <CardTitle className='text-lg font-bold'>
            {t('Global Activity')}
          </CardTitle>
          <CardDescription>
            {t('Live updates from public and joined communities')}
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
      <CardContent className='space-y-4 pt-2'>
        {!roomsReady || loading ? (
          <div className='flex justify-center items-center py-10'>
            <Loader2 className='h-8 w-8 animate-spin text-primary' />
          </div>
        ) : displayedMatches.length === 0 ? (
          <p className='text-center text-muted-foreground py-10 text-sm'>
            {t('No matches found yet.')}
          </p>
        ) : (
          displayedMatches.map((match) => (
            <MatchItem
              key={`${match.sport}-${match.id}`}
              match={match}
              t={t}
              communityName={
                match.roomId ? roomToCommunityMap[match.roomId] : undefined
              }
            />
          ))
        )}
      </CardContent>
      <CardFooter className='flex flex-col gap-4'>
        {!loading && !fullyLoaded && displayedMatches.length > 0 && (
          <Button
            variant='outline'
            className='w-full'
            onClick={() => loadNextBatch(false)}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : null}
            {t('Load More')}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default LiveFeed;