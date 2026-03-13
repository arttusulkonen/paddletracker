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
	Trophy,
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
  accountType?: string;
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
          limit(100),
        );
        const querySnapshot = await getDocs(q);
        const friends = new Set(userProfile?.friends || []);

        const rawPlayers: PlayerData[] = [];

        querySnapshot.forEach((d) => {
          const data = d.data() as UserProfile;
          if (data.isDeleted) return;
          if (data.accountType === 'coach') return;

          const s = data.sports?.[sport];

          rawPlayers.push({
            id: d.id,
            name: data.name || data.displayName || 'Anonymous',
            photoURL: data.photoURL,
            globalElo: s?.globalElo ?? 1000,
            wins: s?.wins ?? 0,
            losses: s?.losses ?? 0,
            isFriend: friends.has(d.id),
            accountType: data.accountType,
          });
        });

        const limitedPlayers = rawPlayers.slice(0, 50);

        const userToCommunityMap: Record<string, string> = {};
        const playerIds = limitedPlayers.map((p) => p.id);
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
              where('members', 'array-contains-any', chunk),
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
          }),
        );

        const finalPlayers = limitedPlayers.map((p) => ({
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
          if (friend.accountType === 'coach') continue;

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
            accountType: friend.accountType,
          });
        }

        const selfEntry: PlayerData | null =
          userProfile.accountType === 'coach'
            ? null
            : {
                id: userProfile.uid,
                name: userProfile.name || userProfile.displayName || 'Me',
                photoURL: userProfile.photoURL,
                globalElo: userProfile.sports?.[sport]?.globalElo ?? 1000,
                wins: userProfile.sports?.[sport]?.wins ?? 0,
                losses: userProfile.sports?.[sport]?.losses ?? 0,
                isFriend: false,
                isSelf: true,
                accountType: userProfile.accountType,
              };

        const merged = selfEntry ? [selfEntry, ...list] : list;

        const dedup = Array.from(
          new Map(merged.map((p) => [p.id, p])).values(),
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
      <Card className='border-0 rounded-[2.5rem] glass-panel shadow-xl'>
        <CardHeader className='px-8 pt-8 pb-4'>
          <div className='h-8 w-48 bg-muted rounded-xl animate-pulse' />
          <div className='h-4 w-64 bg-muted rounded-xl animate-pulse mt-2' />
        </CardHeader>
        <CardContent className='px-8 pb-8'>
          <div className='space-y-4'>
            <div className='h-12 w-full bg-muted rounded-2xl animate-pulse' />
            <div className='h-12 w-full bg-muted rounded-2xl animate-pulse' />
            <div className='h-12 w-full bg-muted rounded-2xl animate-pulse' />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className='border-0 rounded-[2.5rem] glass-panel shadow-2xl relative overflow-hidden group'>
      <div className='absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none' />
      <CardHeader className='px-6 md:px-10 pt-8 md:pt-10 pb-6 relative z-10'>
        <CardTitle className='text-3xl font-extrabold tracking-tight flex items-center gap-3'>
          <div className='bg-primary/10 p-3 rounded-2xl ring-1 ring-primary/20 text-primary shadow-sm'>
            <Trophy className='h-6 w-6' />
          </div>
          {t('Leaderboard')}{' '}
          <span className='opacity-50 font-medium ml-1'>
            ({sportConfig[sport].name})
          </span>
        </CardTitle>
        <CardDescription className='text-base font-light text-muted-foreground mt-2'>
          {t(
            'Global and "My Circles" ranking based on ELO in the selected sport.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='px-4 md:px-8 pb-8 relative z-10'>
        <Tabs defaultValue='circles' className='w-full'>
          <div className='mb-6 flex justify-center sm:justify-start'>
            <TabsList className='grid w-full sm:w-auto grid-cols-2 p-1.5 bg-muted/30 rounded-2xl ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-xl h-auto'>
              <TabsTrigger
                value='global'
                className='rounded-xl py-2.5 px-6 font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all text-sm'
              >
                <BarChartHorizontal className='mr-2 h-4 w-4' />
                {t('Global')}
              </TabsTrigger>
              <TabsTrigger
                value='circles'
                className='rounded-xl py-2.5 px-6 font-semibold data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all text-sm'
              >
                <Shield className='mr-2 h-4 w-4' />
                {t('My Circles')}
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent
            value='circles'
            className='m-0 animate-in fade-in duration-500'
          >
            <PlayerList players={myCirclesPlayers} />
          </TabsContent>
          <TabsContent
            value='global'
            className='m-0 animate-in fade-in duration-500'
          >
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
      <div className='text-center py-16 bg-background/40 backdrop-blur-sm rounded-[2rem] ring-1 ring-black/5 dark:ring-white/5'>
        <p className='text-lg font-semibold text-foreground'>
          {t('No players to show here yet.')}
        </p>
        <p className='text-sm mt-2 text-muted-foreground font-light'>
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
    <div className='overflow-x-auto bg-background/50 backdrop-blur-xl rounded-[2rem] ring-1 ring-black/5 dark:ring-white/10 shadow-inner p-2'>
      <Table>
        <TableHeader>
          <TableRow className='hover:bg-transparent border-b-black/5 dark:border-b-white/5'>
            <TableHead className='w-12 pl-6 text-center text-[10px] uppercase font-bold tracking-widest text-muted-foreground'>
              #
            </TableHead>
            <TableHead className='text-[10px] uppercase font-bold tracking-widest text-muted-foreground'>
              {t('Player')}
            </TableHead>
            <TableHead className='hidden sm:table-cell text-[10px] uppercase font-bold tracking-widest text-muted-foreground'>
              {t('Community')}
            </TableHead>
            <TableHead className='text-right text-[10px] uppercase font-bold tracking-widest text-muted-foreground'>
              {t('ELO')}
            </TableHead>
            <TableHead className='text-right hidden sm:table-cell text-[10px] uppercase font-bold tracking-widest text-muted-foreground'>
              {t('W / L')}
            </TableHead>
            <TableHead className='text-right pr-6'>
              <div className='flex items-center justify-end gap-1 opacity-50'>
                <Percent className='h-3.5 w-3.5' />
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
              <TableRow
                key={player.id}
                className='group hover:bg-muted/30 border-b-black/5 dark:border-b-white/5 transition-colors cursor-pointer'
              >
                <TableCell className='pl-6 text-center font-mono font-medium text-muted-foreground'>
                  {index + 1}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/profile/${player.id}`}
                    className='flex items-center gap-4 py-2'
                  >
                    <div className='relative'>
                      <Avatar className='h-10 w-10 sm:h-12 sm:w-12 ring-1 ring-black/5 dark:ring-white/10 shadow-sm group-hover:scale-105 transition-transform'>
                        <AvatarImage src={player.photoURL || undefined} />
                        <AvatarFallback className='bg-primary/10 text-primary font-semibold'>
                          {player.name?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      {medalSrc && (
                        <img
                          src={medalSrc}
                          alt={rankLabel}
                          className='absolute -bottom-1.5 -right-1.5 h-5 w-5 drop-shadow-md'
                          title={rankLabel}
                        />
                      )}
                    </div>
                    <div className='flex flex-col'>
                      <span className='font-bold text-base flex items-center gap-2 group-hover:text-primary transition-colors tracking-tight'>
                        {player.name}
                        {player.isSelf && (
                          <span className='text-[9px] rounded-full px-2 py-0.5 bg-primary text-primary-foreground font-black uppercase tracking-widest shadow-sm'>
                            {t('YOU')}
                          </span>
                        )}
                      </span>
                      <span className='text-xs text-muted-foreground sm:hidden font-medium mt-0.5'>
                        {player.communityName}
                      </span>
                    </div>
                  </Link>
                </TableCell>

                <TableCell className='hidden sm:table-cell'>
                  {player.communityName ? (
                    <div className='flex items-center gap-2 text-sm text-muted-foreground font-medium'>
                      <Building2 className='h-3.5 w-3.5 opacity-50' />
                      <span>{player.communityName}</span>
                    </div>
                  ) : (
                    <span className='text-muted-foreground/30 text-sm'>-</span>
                  )}
                </TableCell>

                <TableCell className='text-right font-black text-lg text-primary tracking-tight'>
                  {player.globalElo.toFixed(0)}
                </TableCell>

                <TableCell className='text-right text-sm font-bold hidden sm:table-cell'>
                  <span className='text-emerald-500'>{player.wins}</span>{' '}
                  <span className='opacity-30 px-0.5'>/</span>{' '}
                  <span className='text-red-500'>{player.losses}</span>
                </TableCell>

                <TableCell className='text-right pr-6 text-sm font-black'>
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
