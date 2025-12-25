'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import {
	collection,
	documentId,
	getDocs,
	query,
	where,
} from 'firebase/firestore';
import { Ghost, Loader2, Search, Shield, User } from 'lucide-react';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type MemberData = {
  uid: string;
  name: string;
  displayName?: string;
  email?: string;
  photoURL?: string | null;
  isGhost?: boolean;
  globalElo?: number;
  matchesPlayed?: number;
  activeSport?: string;
  isAdmin?: boolean;
};

export default function ManageMembersPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [members, setMembers] = useState<MemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchMembers = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const uniqueUserIds = new Set<string>();
        const adminIds = new Set<string>();

        // 1. Fetch Communities managed by user
        const communitiesQ = query(
          collection(db, 'communities'),
          where('admins', 'array-contains', user.uid)
        );
        const communitiesSnap = await getDocs(communitiesQ);
        communitiesSnap.forEach((doc) => {
          const data = doc.data();
          
          if (Array.isArray(data.members)) {
            data.members.forEach((uid: string) => uniqueUserIds.add(uid));
          }
          
          if (Array.isArray(data.admins)) {
            data.admins.forEach((uid: string) => {
              uniqueUserIds.add(uid);
              adminIds.add(uid);
            });
          }
          if (data.ownerId) {
             uniqueUserIds.add(data.ownerId);
             adminIds.add(data.ownerId);
          }
        });

        // 2. Fetch Ghost players
        const ghostsQ = query(
          collection(db, 'users'),
          where('managedBy', '==', user.uid),
          where('isGhost', '==', true)
        );
        const ghostsSnap = await getDocs(ghostsQ);
        ghostsSnap.forEach((doc) => {
          uniqueUserIds.add(doc.id);
        });

        // 3. Fetch user details
        const allIds = Array.from(uniqueUserIds);
        const fetchedMembers: MemberData[] = [];

        if (allIds.length > 0) {
          const chunks = [];
          for (let i = 0; i < allIds.length; i += 10) {
            chunks.push(allIds.slice(i, i + 10));
          }

          for (const chunk of chunks) {
            const usersQ = query(
              collection(db, 'users'),
              where(documentId(), 'in', chunk)
            );
            const usersSnap = await getDocs(usersQ);
            usersSnap.forEach((doc) => {
              const d = doc.data();
              
              // --- FIX: Read stats from specific sport ---
              const sportKey = d.activeSport || 'pingpong';
              const sportData = d.sports?.[sportKey] || {};
              
              // Fallback to root stats if sport data is missing/empty (legacy support)
              const elo = sportData.globalElo ?? d.globalElo ?? 1000;
              const matches = (sportData.wins ?? 0) + (sportData.losses ?? 0);
              const totalMatches = matches > 0 ? matches : (d.matchesPlayed ?? 0);

              fetchedMembers.push({
                uid: doc.id,
                name: d.name || d.displayName || 'Unknown',
                displayName: d.displayName,
                email: d.email,
                photoURL: d.photoURL,
                isGhost: d.isGhost,
                globalElo: elo,
                matchesPlayed: totalMatches,
                activeSport: sportKey,
                isAdmin: adminIds.has(doc.id),
              });
            });
          }
        }

        fetchedMembers.sort((a, b) => {
          const nameA = a.displayName || a.name || '';
          const nameB = b.displayName || b.name || '';
          return nameA.localeCompare(nameB);
        });

        setMembers(fetchedMembers);
      } catch (error) {
        console.error('Error fetching members:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMembers();
  }, [user]);

  const filteredMembers = members.filter((m) => {
    const searchLower = searchTerm.toLowerCase();
    const name = (m.displayName || m.name || '').toLowerCase();
    const email = (m.email || '').toLowerCase();
    return name.includes(searchLower) || email.includes(searchLower);
  });

  const playersList = filteredMembers.filter(m => !m.isAdmin || m.isGhost);
  const adminsList = filteredMembers.filter(m => m.isAdmin && !m.isGhost);

  const MemberGrid = ({ list }: { list: MemberData[] }) => {
    if (list.length === 0) {
        return (
            <div className='text-center py-12 border rounded-lg bg-muted/10'>
              <p className='text-muted-foreground'>{t('No members found in this category.')}</p>
            </div>
        );
    }
    return (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'>
          {list.map((member) => (
            <Card key={member.uid} className='overflow-hidden hover:shadow-md transition-shadow'>
              <CardHeader className='flex flex-row items-center gap-4 pb-2'>
                <Avatar className='h-12 w-12 border'>
                  <AvatarImage src={member.photoURL || undefined} />
                  <AvatarFallback>{member.name[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className='flex flex-col overflow-hidden'>
                  <CardTitle className='text-base truncate flex items-center gap-2'>
                    {member.displayName || member.name}
                  </CardTitle>
                  <div className='flex gap-2 mt-1'>
                    {member.isGhost ? (
                        <Badge variant="secondary" className="text-[10px] px-1.5 h-5 flex gap-1 items-center">
                            <Ghost className="h-3 w-3" /> {t('Ghost')}
                        </Badge>
                    ) : member.isAdmin ? (
                        <Badge className="text-[10px] px-1.5 h-5 flex gap-1 items-center bg-indigo-500 hover:bg-indigo-600">
                            <Shield className="h-3 w-3" /> {t('Organizer')}
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="text-[10px] px-1.5 h-5 flex gap-1 items-center">
                            <User className="h-3 w-3" /> {t('Player')}
                        </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className='pb-2'>
                <div className='grid grid-cols-2 gap-2 text-sm mt-2'>
                    <div className='flex flex-col bg-muted/30 p-2 rounded'>
                        <span className='text-xs text-muted-foreground'>{t('Global ELO')}</span>
                        <span className='font-bold'>{Math.round(member.globalElo || 1000)}</span>
                    </div>
                    <div className='flex flex-col bg-muted/30 p-2 rounded'>
                        <span className='text-xs text-muted-foreground'>{t('Matches')}</span>
                        <span className='font-bold'>{member.matchesPlayed}</span>
                    </div>
                </div>
              </CardContent>
              <CardFooter className='pt-2'>
                <Button variant='ghost' className='w-full text-xs' asChild>
                  <Link href={`/profile/${member.uid}`}>
                    {t('View Profile')}
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
    );
  };

  if (loading) {
    return (
      <div className='flex justify-center items-center h-64'>
        <Loader2 className='h-8 w-8 animate-spin text-primary' />
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <div className='flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>
            {t('Community Members')}
          </h2>
          <p className='text-muted-foreground'>
            {t('View all players and organizers from your communities.')}
          </p>
        </div>
        <div className='relative w-full sm:w-64'>
          <Search className='absolute left-2 top-2.5 h-4 w-4 text-muted-foreground' />
          <Input
            placeholder={t('Search...')}
            className='pl-8'
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <Tabs defaultValue="players" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="players">
             {t('Players')} 
             <span className="ml-2 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{playersList.length}</span>
          </TabsTrigger>
          <TabsTrigger value="admins">
             {t('Organizers')}
             <span className="ml-2 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{adminsList.length}</span>
          </TabsTrigger>
        </TabsList>
        
        <div className="mt-6">
            <TabsContent value="players">
                <MemberGrid list={playersList} />
            </TabsContent>
            <TabsContent value="admins">
                <MemberGrid list={adminsList} />
            </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}