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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
import { BarChartHorizontal, Percent, Shield, Users } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
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
      try {
        const q = query(
          collection(db, 'users'),
          where('isPublic', '==', true),
          orderBy(`sports.${sport}.globalElo`, 'desc'),
          limit(100)
        );
        const querySnapshot = await getDocs(q);
        const friends = new Set(userProfile?.friends || []);
        const fetchedPlayers: PlayerData[] = [];
        querySnapshot.forEach((d) => {
          const data = d.data() as UserProfile;
          if (data.isDeleted) return;
          const s = data.sports?.[sport];
          fetchedPlayers.push({
            id: d.id,
            name: data.name || data.displayName || 'Anonymous',
            photoURL: data.photoURL,
            globalElo: s?.globalElo ?? 1000,
            wins: s?.wins ?? 0,
            losses: s?.losses ?? 0,
            isFriend: friends.has(d.id),
          });
        });
        setPlayers(fetchedPlayers);
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
        console.error('Error fetching Friends:', error); // <--- И ЗДЕСЬ
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
    <Card>
      <CardHeader>
        <CardTitle>Leaderboard ({sportConfig[sport].name})</CardTitle>
        <CardDescription>
          {t(
            'Global and "My Circles" ranking based on ELO in the selected sport.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue='circles'>
          <TabsList className='grid w-full grid-cols-2'>
            <TabsTrigger value='circles'>
              <Shield className='mr-2 h-4 w-4' />
              {t('My Circles')}
            </TabsTrigger>
            <TabsTrigger value='global'>
              <BarChartHorizontal className='mr-2 h-4 w-4' />
              {t('Global Ranking')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value='circles'>
            <PlayerList players={myCirclesPlayers} />
          </TabsContent>
          <TabsContent value='global'>
            <PlayerList players={players} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

// --- НАЧАЛО ИЗМЕНЕНИЙ ---

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

  // Обновленная логика ELO на основе вашей функции.
  // Эта функция возвращает КЛЮЧ для перевода и для medalMap.
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
          <TableRow>
            <TableHead className='w-[50px]'>#</TableHead>
            <TableHead>{t('Player')}</TableHead>
            <TableHead>{t('Rank')}</TableHead>
            <TableHead className='text-right'>{t('ELO')}</TableHead>
            <TableHead className='text-right'>{t('W / L')}</TableHead>
            <TableHead className='text-right'>
              <div className='flex items-center justify-end gap-1'>
                <Percent className='h-4 w-4' /> {t('Win Rate')}
              </div>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.map((player, index) => {
            // Вычисляем доп. данные
            const { globalElo, wins, losses } = player;
            const rankKey = getRankKey(globalElo);
            const rankLabel = t(rankKey); // Переводим ключ
            const medalSrc = medalMap[rankKey]; // Получаем медаль по ключу
            const matches = wins + losses;
            const winRate = matches > 0 ? (wins / matches) * 100 : 0;

            return (
              <TableRow key={player.id}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>
                  <a
                    href={`/profile/${player.id}`}
                    className='flex items-center gap-3 group'
                  >
                    <Avatar className='h-9 w-9'>
                      <AvatarImage src={player.photoURL || undefined} />
                      <AvatarFallback>{player.name?.[0]}</AvatarFallback>
                    </Avatar>
                    <span className='font-medium group-hover:underline flex items-center'>
                      {player.name}
                      {player.isSelf && (
                        <span className='ml-2 text-xs rounded px-1.5 py-0.5 bg-primary/10 text-primary'>
                          {t('You')}
                        </span>
                      )}
                      {player.isFriend && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Users className='inline-block ml-2 h-4 w-4 text-blue-500' />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{t('In your friend list')}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </span>
                  </a>
                </TableCell>
                {/* Ячейка для Ранга */}
                <TableCell>
                  <div className='flex items-center gap-2'>
                    {medalSrc && (
                      <img src={medalSrc} alt={rankLabel} className='h-7 w-7' />
                    )}
                    <span className='text-xs text-muted-foreground'>
                      {rankLabel}
                    </span>
                  </div>
                </TableCell>
                {/* Ячейка ELO */}
                <TableCell className='text-right font-bold'>
                  {player.globalElo.toFixed(0)}
                </TableCell>
                {/* Ячейка W / L */}
                <TableCell className='text-right'>
                  {player.wins} / {player.losses}
                </TableCell>
                {/* Ячейка для Win Rate */}
                <TableCell className='text-right text-muted-foreground'>
                  {winRate.toFixed(1)}%
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

// --- КОНЕЦ ИЗМЕНЕНИЙ ---

export default PlayersTable;
