// src/app/manage/communities/[communityId]/page.tsx
'use client';

import { CommunitySettingsDialog } from '@/components/communities/CommunitySettingsDialog';
import { CommunityWrap } from '@/components/communities/CommunityWrap'; // <--- Импорт
import { RoomCard } from '@/components/rooms/RoomCard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
	ArrowLeft,
	LayoutGrid,
	Loader2,
	Settings,
	Warehouse,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function CommunityDetailsPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const { config } = useSport();
  const communityId = params.communityId as string;

  const [community, setCommunity] = useState<Community | null>(null);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const docRef = doc(db, 'communities', communityId);
        const snap = await getDoc(docRef);

        if (!snap.exists()) {
          router.push('/manage/communities');
          return;
        }

        const commData = { id: snap.id, ...snap.data() } as Community;
        setCommunity(commData);

        // Fetch Members
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

        // Fetch Rooms
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

  if (loading) {
    return (
      <div className='flex justify-center py-10'>
        <Loader2 className='animate-spin' />
      </div>
    );
  }

  if (!community) return null;

  return (
    <div className='space-y-6'>
      {/* Header */}
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

          <CommunitySettingsDialog community={community}>
            <Button variant='outline' size='sm'>
              <Settings className='mr-2 h-4 w-4' />
              {t('Settings')}
            </Button>
          </CommunitySettingsDialog>
        </div>
      </div>

      <Tabs defaultValue='members'>
        <TabsList>
          <TabsTrigger value='members'>
            {t('Members')} ({members.length})
          </TabsTrigger>
          <TabsTrigger value='rooms'>
            {t('Rooms')} ({rooms.length})
          </TabsTrigger>
          <TabsTrigger value='stats'>{t('Wrapped')}</TabsTrigger>{' '}
          {/* Переименовал в Wrapped */}
        </TabsList>

        {/* Members Tab */}
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
                <div className='grid gap-4'>
                  {members.map((member) => (
                    <div
                      key={member.uid}
                      className='flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors'
                    >
                      <div className='flex items-center gap-3'>
                        <Avatar>
                          <AvatarImage src={member.photoURL || undefined} />
                          <AvatarFallback>{member.name?.[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className='font-semibold'>{member.name}</div>
                          <div className='text-xs text-muted-foreground'>
                            ELO: {Math.round(getDisplayElo(member))}
                          </div>
                        </div>
                      </div>
                      <Button variant='ghost' size='sm' asChild>
                        <Link href={`/profile/${member.uid}`}>
                          {t('View Profile')}
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rooms Tab */}
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

        {/* Wrapped / Statistics Tab */}
        <TabsContent value='stats' className='mt-4'>
          <CommunityWrap community={community} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
