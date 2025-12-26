// src/components/PlayersTable.tsx
'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';


import { useAuth } from '@/contexts/AuthContext';
import { sportConfig } from '@/contexts/SportContext';
import { db } from '@/lib/firebase';
import * as Friends from '@/lib/friends';
import type { Sport, UserProfile } from '@/lib/types';
import { medalMap } from '@/lib/utils/profileUtils';
import {
	collection,
	getDocs,
	limit,
	orderBy,
	query,
	where,
} from 'firebase/firestore';
import {
	BarChartHorizontal,
	Building2,
	Percent,
	Shield,
} from 'lucide-react';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface PlayersTableProps {
  sport: Sport;
}

type PlayerData = {
  id: string;
  name: string;
  photoURL?: string | null;
  globalElo: number;
  wins: number;
  losses: number;
  isFriend: boolean;
  isSelf?: boolean;
  communityName?: string;
  communityId?: string;
};

const PlayersTable: React.FC<PlayersTableProps> = ({ sport }) => {
  const { t } = useTranslation();
  const { userProfile } = useAuth();
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [myCirclesPlayers, setMyCirclesPlayers] = useState<PlayerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingFriends, setLoadingFriends] = useState(true);

  useEffect(() => {
    const fetchPlayers = async () => {
      setLoading(true);
			if (!db) return;
      try {
        const q = query(
          collection(db, 'users'),
          where('isPublic', '==', true),
          orderBy(`sports.${sport}.globalElo`, 'desc'),
          limit(50)
        );
        const querySnapshot = await getDocs(q);
        const friends = new Set(userProfile?.friends || []);

        const rawPlayers: PlayerData[] = [];

        querySnapshot.forEach((d) => {
          const data = d.data() as UserProfile;
          if (data.isDeleted) return;
          
          const s = data.sports?.[sport];

          rawPlayers.push({
            id: d.id,
            name: data.name || data.displayName || 'Anonymous',
            photoURL: data.photoURL,
            globalElo: s?.globalElo ?? 1000,
            wins: s?.wins ?? 0,
            losses: s?.losses ?? 0,
            isFriend: friends.has(d.id),
          });
        });

        const userToCommunityMap: Record<string, string> = {};
        const playerIds = rawPlayers.map((p) => p.id);
        const chunkSize = 10;
        const chunks = [];

        for (let i = 0; i < playerIds.length; i += chunkSize) {
          chunks.push(playerIds.slice(i, i + chunkSize));
        }

        await Promise.all(
          chunks.map(async (chunk) => {
						if (!db) return;
            const communitiesQuery = query(
              collection(db, 'communities'),
              where('members', 'array-contains-any', chunk)
            );
            const communitiesSnap = await getDocs(communitiesQuery);
            
            communitiesSnap.forEach((doc) => {
              const cData = doc.data();
              const members = cData.members || [];
              const cName = cData.name;

              if (Array.isArray(members)) {
                members.forEach((uid: string) => {
                  if (playerIds.includes(uid) && !userToCommunityMap[uid]) {
                    userToCommunityMap[uid] = cName;
                  }
                });
              }
            });
          })
        );

        const finalPlayers = rawPlayers.map((p) => ({
          ...p,
          communityName: userToCommunityMap[p.id],
        }));

        setPlayers(finalPlayers);
      } catch (error) {
        console.error('Error fetching Global Ranking:', error);
        setPlayers([]);
      } finally {
        setLoading(false);
      }
    };
    fetchPlayers();
  }, [userProfile, sport]);

  useEffect(() => {
    const fetchFriends = async () => {
      if (!userProfile) {
        setMyCirclesPlayers([]);
        setLoadingFriends(false);
        return;
      }
      setLoadingFriends(true);
      try {
        const friendIds = userProfile.friends || [];
        const friendProfiles =
          friendIds.length > 0
            ? await Friends.getMultipleUsersLite(friendIds)
            : [];

        const list: PlayerData[] = [];
        for (const friend of friendProfiles) {
          const s = friend.sports?.[sport] || {
            globalElo: 1000,
            wins: 0,
            losses: 0,
          };
          list.push({
            id: friend.uid,
            name: friend.name || friend.displayName || 'Anonymous',
            photoURL: friend.photoURL,
            globalElo: s.globalElo ?? 1000,
            wins: s.wins ?? 0,
            losses: s.losses ?? 0,
            isFriend: true,
          });
        }

        const selfSport = userProfile.sports?.[sport] || {
          globalElo: 1000,
          wins: 0,
          losses: 0,
        };
        const selfEntry: PlayerData = {
          id: userProfile.uid,
          name: userProfile.name || userProfile.displayName || 'Me',
          photoURL: userProfile.photoURL,
          globalElo: selfSport.globalElo ?? 1000,
          wins: selfSport.wins ?? 0,
          losses: selfSport.losses ?? 0,
          isFriend: false,
          isSelf: true,
        };

        const merged = [selfEntry, ...list];
        const dedup = Array.from(
          new Map(merged.map((p) => [p.id, p])).values()
        ).sort((a, b) => b.globalElo - a.globalElo);

        setMyCirclesPlayers(dedup);
      } catch (error) {
        console.error('Error fetching Friends:', error);
        setMyCirclesPlayers([]);
      } finally {
        setLoadingFriends(false);
      }
    };
    fetchFriends();
  }, [userProfile, sport]);

  const isOverallLoading = loading || loadingFriends;

  if (isOverallLoading) {
    return (
      <Card>
        <CardHeader>
          <div className='h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse' />
          <div className='h-4 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse' />
        </CardHeader>
        <CardContent>
          <div className='space-y-4'>
            <div className='h-10 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse' />
            <div className='h-10 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse' />
            <div className='h-10 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse' />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className='border-none shadow-md'>
      <CardHeader>
        <CardTitle>
          {t('Leaderboard')} ({sportConfig[sport].name})
        </CardTitle>
        <CardDescription>
          {t(
            'Global and "My Circles" ranking based on ELO in the selected sport.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='p-0 sm:p-6'>
        <Tabs defaultValue='circles' className='w-full'>
          <div>
            <TabsList className='grid w-full grid-cols-2 mb-4'>
              <TabsTrigger value='global'>
                <BarChartHorizontal className='mr-2 h-4 w-4' />
                {t('Global')}
              </TabsTrigger>
              <TabsTrigger value='circles'>
                <Shield className='mr-2 h-4 w-4' />
                {t('My Circles')}
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value='circles' className='m-0'>
            <PlayerList players={myCirclesPlayers} />
          </TabsContent>
          <TabsContent value='global' className='m-0'>
            <PlayerList players={players} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

const PlayerList = ({ players }: { players: PlayerData[] }) => {
  const { t } = useTranslation();

  if (players.length === 0) {
    return (
      <div className='text-center py-10 text-muted-foreground'>
        <p>{t('No players to show here yet.')}</p>
        <p className='text-xs mt-2'>
          {t('(Play some games to appear on the leaderboard!)')}
        </p>
      </div>
    );
  }

  const getRankKey = (elo: number) => {
    if (elo < 1001) return 'Ping-Pong Padawan';
    if (elo < 1100) return 'Table-Tennis Trainee';
    if (elo < 1200) return 'Racket Rookie';
    if (elo < 1400) return 'Paddle Prodigy';
    if (elo < 1800) return 'Spin Sensei';
    if (elo < 2000) return 'Smash Samurai';
    return 'Ping-Pong Paladin';
  };

  return (
    <div className='overflow-x-auto'>
      <Table>
        <TableHeader>
          <TableRow className='hover:bg-transparent'>
            <TableHead className='w-[10px] pl-4 text-center'>#</TableHead>
            <TableHead>{t('Player')}</TableHead>
            <TableHead className='hidden sm:table-cell'>
              {t('Community')}
            </TableHead>
            <TableHead className='text-right'>{t('ELO')}</TableHead>
            <TableHead className='text-right hidden sm:table-cell'>
              {t('W / L')}
            </TableHead>
            <TableHead className='text-right pr-4'>
              <div className='flex items-center justify-end gap-1'>
                <Percent className='h-3 w-3' />
              </div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.map((player, index) => {
            const { globalElo, wins, losses } = player;
            const rankKey = getRankKey(globalElo);
            const rankLabel = t(rankKey);
            const medalSrc = medalMap[rankKey];
            const matches = wins + losses;
            const winRate = matches > 0 ? (wins / matches) * 100 : 0;

            return (
              <TableRow key={player.id} className='group'>
                <TableCell className='pl-4 text-center text-muted-foreground text-xs'>
                  {index + 1}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/profile/${player.id}`}
                    className='flex items-center gap-3'
                  >
                    <div className='relative'>
                      <Avatar className='h-8 w-8 sm:h-9 sm:w-9 border border-border'>
                        <AvatarImage src={player.photoURL || undefined} />
                        <AvatarFallback>{player.name?.[0]}</AvatarFallback>
                      </Avatar>
                      {medalSrc && (
                        <img
                          src={medalSrc}
                          alt={rankLabel}
                          className='absolute -bottom-1 -right-1 h-4 w-4 drop-shadow-sm'
                          title={rankLabel}
                        />
                      )}
                    </div>
                    <div className='flex flex-col'>
                      <span className='font-medium text-sm flex items-center gap-1 group-hover:text-primary transition-colors'>
                        {player.name}
                        {player.isSelf && (
                          <span className='text-[10px] rounded px-1 py-0.5 bg-primary/10 text-primary font-bold'>
                            {t('YOU')}
                          </span>
                        )}
                      </span>
                      <span className='text-[10px] text-muted-foreground sm:hidden'>
                        {player.communityName}
                      </span>
                    </div>
                  </Link>
                </TableCell>

                <TableCell className='hidden sm:table-cell'>
                  {player.communityName ? (
                    <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                      <Building2 className='h-3 w-3' />
                      <span>{player.communityName}</span>
                    </div>
                  ) : (
                    <span className='text-muted-foreground/30 text-xs'>-</span>
                  )}
                </TableCell>

                <TableCell className='text-right font-bold text-sm'>
                  {player.globalElo.toFixed(0)}
                </TableCell>

                <TableCell className='text-right text-xs text-muted-foreground hidden sm:table-cell'>
                  <span className='text-green-600'>{player.wins}</span> /{' '}
                  <span className='text-red-500'>{player.losses}</span>
                </TableCell>

                <TableCell className='text-right pr-4 text-xs font-medium'>
                  {winRate.toFixed(0)}%
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export default PlayersTable;