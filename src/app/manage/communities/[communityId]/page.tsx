// src/app/manage/communities/[communityId]/page.tsx
'use client';

import CommunityFeed from '@/components/communities/CommunityFeed';
import { CommunitySettingsDialog } from '@/components/communities/CommunitySettingsDialog';
import { CommunityWrap } from '@/components/communities/CommunityWrap';
import { RoomCard } from '@/components/rooms/RoomCard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useSport } from '@/contexts/SportContext';
import { db } from '@/lib/firebase';
import type { Community, Room, UserProfile } from '@/lib/types';
import {
	collection,
	doc,
	documentId,
	getDoc,
	getDocs,
	query,
	where,
} from 'firebase/firestore';
import {
	Activity,
	ArrowLeft,
	LayoutGrid,
	Loader2,
	Settings,
	ShieldCheck,
	Warehouse,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function CommunityDetailsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const { config } = useSport();
  const communityId = params.communityId as string;

  const [community, setCommunity] = useState<Community | null>(null);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  const canManage = useMemo(() => {
    if (!user || !community) return false;
    return (
      user.uid === community.ownerId ||
      (community.admins && community.admins.includes(user.uid))
    );
  }, [user, community]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!db) return;
        const docRef = doc(db, 'communities', communityId);
        const snap = await getDoc(docRef);

        if (!snap.exists()) {
          router.push('/manage/communities');
          return;
        }

        const commData = { id: snap.id, ...snap.data() } as Community;
        setCommunity(commData);

        if (commData.members && commData.members.length > 0) {
          const chunks = [];
          const memberIds = commData.members;
          const chunkSize = 10;
          for (let i = 0; i < memberIds.length; i += chunkSize) {
            chunks.push(memberIds.slice(i, i + chunkSize));
          }

          const allMembers: UserProfile[] = [];
          for (const chunk of chunks) {
            const q = query(
              collection(db, 'users'),
              where(documentId(), 'in', chunk)
            );
            const mSnap = await getDocs(q);
            mSnap.forEach((d) =>
              allMembers.push({ uid: d.id, ...d.data() } as UserProfile)
            );
          }
          setMembers(allMembers);
        } else {
          setMembers([]);
        }

        if (commData.roomIds && commData.roomIds.length > 0) {
          const chunks = [];
          const rIds = commData.roomIds;
          const chunkSize = 10;
          for (let i = 0; i < rIds.length; i += chunkSize) {
            chunks.push(rIds.slice(i, i + chunkSize));
          }

          const allRooms: Room[] = [];
          for (const chunk of chunks) {
            const q = query(
              collection(db, config.collections.rooms),
              where(documentId(), 'in', chunk)
            );
            const rSnap = await getDocs(q);
            rSnap.forEach((d) =>
              allRooms.push({ id: d.id, ...d.data() } as Room)
            );
          }
          setRooms(allRooms);
        } else {
          setRooms([]);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    if (communityId) fetchData();
  }, [communityId, router, config.collections.rooms]);

  const getDisplayElo = (u: UserProfile) => {
    const s = u.activeSport || 'pingpong';
    return u.sports?.[s]?.globalElo ?? u.globalElo ?? 1000;
  };

  const { admins, players } = useMemo(() => {
    if (!community) return { admins: [], players: [] };

    const adminIds = new Set([community.ownerId, ...(community.admins || [])]);

    const adminsList: UserProfile[] = [];
    const playersList: UserProfile[] = [];

    members.forEach((m) => {
      if (adminIds.has(m.uid)) {
        adminsList.push(m);
      } else {
        playersList.push(m);
      }
    });

    adminsList.sort((a, b) => {
      if (a.uid === community.ownerId) return -1;
      if (b.uid === community.ownerId) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
    playersList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    return { admins: adminsList, players: playersList };
  }, [members, community]);

  if (loading) {
    return (
      <div className='flex justify-center py-10'>
        <Loader2 className='animate-spin' />
      </div>
    );
  }

  if (!community) return null;

  const renderMemberRow = (member: UserProfile, isAdmin: boolean) => {
    const isCoach = member.accountType === 'coach';
    const showElo = !isCoach;

    return (
      <div
        key={member.uid}
        className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
          isAdmin ? 'bg-primary/5 border-primary/20' : 'hover:bg-accent/50'
        }`}
      >
        <div className='flex items-center gap-3'>
          <Avatar>
            <AvatarImage src={member.photoURL || undefined} />
            <AvatarFallback>{member.name?.[0]}</AvatarFallback>
          </Avatar>
          <div>
            <div className='font-semibold flex items-center gap-2'>
              {member.name}
              {isAdmin && (
                <Badge
                  variant='outline'
                  className='text-[10px] h-5 px-1 bg-background'
                >
                  {member.uid === community.ownerId ? t('Owner') : t('Admin')}
                </Badge>
              )}
              {isCoach && !isAdmin && (
                <Badge variant='secondary' className='text-[10px] h-5 px-1'>
                  {t('Coach')}
                </Badge>
              )}
            </div>

            {showElo ? (
              <div className='text-xs text-muted-foreground'>
                ELO: {Math.round(getDisplayElo(member))}
              </div>
            ) : (
              <div className='text-xs text-muted-foreground italic'>
                {t('Organizer')}
              </div>
            )}
          </div>
        </div>
        <Button variant='ghost' size='sm' asChild>
          <Link href={`/profile/${member.uid}`}>{t('View Profile')}</Link>
        </Button>
      </div>
    );
  };

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-4'>
        <Link
          href='/manage/communities'
          className='text-sm text-muted-foreground flex items-center gap-1 hover:text-primary'
        >
          <ArrowLeft className='h-4 w-4' /> {t('Back to Communities')}
        </Link>

        <div className='flex items-start justify-between'>
          <div className='flex items-center gap-4'>
            <div className='h-16 w-16 bg-primary/10 rounded-lg flex items-center justify-center border-2 border-primary/20'>
              <Warehouse className='h-8 w-8 text-primary' />
            </div>
            <div>
              <h1 className='text-3xl font-bold'>{community.name}</h1>
              <p className='text-muted-foreground'>{community.description}</p>
            </div>
          </div>

          {canManage && (
            <CommunitySettingsDialog community={community}>
              <Button variant='outline' size='sm'>
                <Settings className='mr-2 h-4 w-4' />
                {t('Settings')}
              </Button>
            </CommunitySettingsDialog>
          )}
        </div>
      </div>

      <Tabs defaultValue='feed'>
        <TabsList>
          <TabsTrigger value='feed'>{t('Feed')}</TabsTrigger>
          <TabsTrigger value='members'>
            {t('Members')} ({members.length})
          </TabsTrigger>
          <TabsTrigger value='rooms'>
            {t('Rooms')} ({rooms.length})
          </TabsTrigger>
          <TabsTrigger value='stats'>{t('Wrapped')}</TabsTrigger>
        </TabsList>

        <TabsContent value='feed' className='mt-4'>
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Activity className='h-5 w-5 text-primary' />
                {t('Community Activity')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CommunityFeed />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value='members' className='mt-4'>
          <Card>
            <CardHeader>
              <CardTitle>{t('Player Roster')}</CardTitle>
            </CardHeader>
            <CardContent>
              {members.length === 0 ? (
                <div className='text-center py-8 text-muted-foreground'>
                  {t('No members in this community yet.')}
                </div>
              ) : (
                <div className='space-y-6'>
                  {admins.length > 0 && (
                    <div className='space-y-3'>
                      <h3 className='text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2'>
                        <ShieldCheck className='h-4 w-4' />
                        {t('Administrators & Coaches')}
                      </h3>
                      <div className='grid gap-3'>
                        {admins.map((m) => renderMemberRow(m, true))}
                      </div>
                    </div>
                  )}

                  {players.length > 0 && (
                    <div className='space-y-3'>
                      <h3 className='text-sm font-semibold text-muted-foreground uppercase tracking-wider'>
                        {t('Players')}
                      </h3>
                      <div className='grid gap-3'>
                        {players.map((m) => renderMemberRow(m, false))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value='rooms' className='mt-4'>
          {rooms.length === 0 ? (
            <div className='p-10 text-center text-muted-foreground border rounded-lg border-dashed bg-muted/10'>
              <LayoutGrid className='h-10 w-10 mx-auto mb-2 opacity-20' />
              <p>{t('No rooms linked to this community.')}</p>
              <p className='text-xs mt-1'>
                {t('Go to Settings -> Rooms to link existing rooms.')}
              </p>
            </div>
          ) : (
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
              {rooms.map((r) => (
                <RoomCard key={r.id} room={r} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value='stats' className='mt-4'>
          <CommunityWrap community={community} />
        </TabsContent>
      </Tabs>
    </div>
  );
}