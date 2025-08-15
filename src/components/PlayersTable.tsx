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
import { sportConfig, SportContext } from '@/contexts/SportContext';
import { db } from '@/lib/firebase';
import * as Friends from '@/lib/friends';
import type { Sport, UserProfile } from '@/lib/types';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { BarChartHorizontal, Shield, Users } from 'lucide-react';
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
          where(`sports.${sport}.globalElo`, '>', 0),
          orderBy(`sports.${sport}.globalElo`, 'desc'),
          limit(100)
        );

        const querySnapshot = await getDocs(q);
        const fetchedPlayers: PlayerData[] = [];
        const friends = new Set(userProfile?.friends || []);

        querySnapshot.forEach((doc) => {
          const data = doc.data() as UserProfile;
          if (data.isDeleted) {
            return;
          }

          const sportData = data.sports?.[sport];
          if (sportData) {
            fetchedPlayers.push({
              id: doc.id,
              name: data.name || data.displayName || 'Anonymous',
              photoURL: data.photoURL,
              globalElo: sportData.globalElo ?? 1000,
              wins: sportData.wins ?? 0,
              losses: sportData.losses ?? 0,
              isFriend: friends.has(doc.id),
            });
          }
        });

        setPlayers(fetchedPlayers);
      } catch (error) {
        console.error('Error fetching players:', error);
        setPlayers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPlayers();
  }, [userProfile, sport]);

  useEffect(() => {
    const fetchFriends = async () => {
      if (!userProfile?.friends || userProfile.friends.length === 0) {
        setMyCirclesPlayers([]);
        setLoadingFriends(false);
        return;
      }

      setLoadingFriends(true);
      try {
        const friendProfiles = await Friends.getMultipleUsersLite(
          userProfile.friends
        );
        const friendData: PlayerData[] = friendProfiles
          .map((friend) => {
            // ✅ ИСПРАВЛЕНИЕ: Предоставляем дефолтные значения, если у друга нет данных по этому спорту
            const sportData = friend.sports?.[sport];
            const effectiveSportData = sportData || {
              globalElo: 1000,
              wins: 0,
              losses: 0,
            };

            return {
              id: friend.uid,
              name: friend.name || friend.displayName || 'Anonymous',
              photoURL: friend.photoURL,
              globalElo: effectiveSportData.globalElo ?? 1000,
              wins: effectiveSportData.wins ?? 0,
              losses: effectiveSportData.losses ?? 0,
              isFriend: true,
            };
          })
          .filter(Boolean) as PlayerData[];

        friendData.sort((a, b) => b.globalElo - a.globalElo);

        setMyCirclesPlayers(friendData);
      } catch (error) {
        console.error('Error fetching friends:', error);
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
          <div className='h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse'></div>
          <div className='h-4 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse'></div>
        </CardHeader>
        <CardContent>
          <div className='space-y-4'>
            <div className='h-10 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse'></div>
            <div className='h-10 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse'></div>
            <div className='h-10 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse'></div>
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
          {t('Ranking based on performance in rooms you are part of.')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue='global'>
          <TabsList className='grid w-full grid-cols-2'>
            <TabsTrigger value='global'>
              <BarChartHorizontal className='mr-2 h-4 w-4' />
              {t('Global Ranking')}
            </TabsTrigger>
            <TabsTrigger value='circles'>
              <Shield className='mr-2 h-4 w-4' />
              {t('My Circles')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value='global'>
            <PlayerList players={players} />
          </TabsContent>
          <TabsContent value='circles'>
            <PlayerList players={myCirclesPlayers} />
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

  return (
    <div className='overflow-x-auto'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className='w-[50px]'>#</TableHead>
            <TableHead>{t('Player')}</TableHead>
            <TableHead className='text-right'>{t('ELO')}</TableHead>
            <TableHead className='text-right'>{t('W / L')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.map((player, index) => (
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
              <TableCell className='text-right font-bold'>
                {player.globalElo.toFixed(0)}
              </TableCell>
              <TableCell className='text-right'>
                {player.wins} / {player.losses}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default PlayersTable;
