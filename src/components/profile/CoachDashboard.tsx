'use client';

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/lib/types';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Briefcase, ChevronRight, Ghost, Users, Warehouse } from 'lucide-react';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface CoachDashboardProps {
  profile: UserProfile;
  isSelf: boolean;
}

export function CoachDashboard({ profile, isSelf }: CoachDashboardProps) {
  const { t } = useTranslation();
  const [stats, setStats] = useState({ communities: 0, players: 0, ghosts: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCoachStats = async () => {
      try {
        // 1. Communities managed
        const qComm = query(
          collection(db, 'communities'),
          where('admins', 'array-contains', profile.uid)
        );
        const snapComm = await getDocs(qComm);

        // 2. Players managed (Ghosts + Claimed from this coach)
        const qPlayers = query(
          collection(db, 'users'),
          where('managedBy', '==', profile.uid)
        );
        const snapPlayers = await getDocs(qPlayers);
        
        let ghosts = 0;
        let real = 0;
        snapPlayers.forEach(doc => {
            const d = doc.data();
            if (d.isGhost) ghosts++;
            else real++;
        });

        setStats({
          communities: snapComm.size,
          players: snapPlayers.size,
          ghosts: ghosts
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchCoachStats();
  }, [profile.uid]);

  if (loading) return <div className="animate-pulse h-48 bg-muted rounded-xl" />;

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('Communities')}
            </CardTitle>
            <Warehouse className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.communities}</div>
            <p className="text-xs text-muted-foreground">
              {t('Groups managed')}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('Total Players')}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.players}</div>
            <p className="text-xs text-muted-foreground">
              {t('Profiles created')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('Active Ghosts')}
            </CardTitle>
            <Ghost className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.ghosts}</div>
            <p className="text-xs text-muted-foreground">
              {t('Waiting to be claimed')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions (Only for Self) */}
      {isSelf && (
        <Card className="border-l-4 border-l-indigo-500">
            <CardHeader>
                <CardTitle>{t('Coach Controls')}</CardTitle>
                <CardDescription>{t('Quick access to your management tools')}</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Button variant="outline" className="h-auto py-4 justify-start" asChild>
                    <Link href="/manage/communities">
                        <div className="bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-full mr-3">
                            <Warehouse className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div className="text-left">
                            <div className="font-semibold">{t('Manage Communities')}</div>
                            <div className="text-xs text-muted-foreground">{t('Create groups, leagues')}</div>
                        </div>
                        <ChevronRight className="ml-auto h-4 w-4 opacity-50" />
                    </Link>
                </Button>

                <Button variant="outline" className="h-auto py-4 justify-start" asChild>
                    <Link href="/manage/players">
                        <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-full mr-3">
                            <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="text-left">
                            <div className="font-semibold">{t('Manage Players')}</div>
                            <div className="text-xs text-muted-foreground">{t('Edit ghosts, invite users')}</div>
                        </div>
                        <ChevronRight className="ml-auto h-4 w-4 opacity-50" />
                    </Link>
                </Button>
            </CardContent>
        </Card>
      )}

      {/* Public View info */}
      {!isSelf && (
          <div className="bg-muted/30 p-6 rounded-lg border text-center">
              <Briefcase className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <h3 className="text-lg font-semibold">{t('Coach Profile')}</h3>
              <p className="text-muted-foreground max-w-md mx-auto mt-2">
                  {t('This user is an organizer. They manage communities and tournaments.')}
              </p>
          </div>
      )}
    </div>
  );
}