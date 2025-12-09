// src/app/manage/communities/[communityId]/page.tsx
'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { db } from '@/lib/firebase';
import type { Community, UserProfile } from '@/lib/types';
import { collection, doc, documentId, getDoc, getDocs, query, where } from 'firebase/firestore';
import { ArrowLeft, Loader2, Settings, Users, Warehouse } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function CommunityDetailsPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const communityId = params.communityId as string;

  const [community, setCommunity] = useState<Community | null>(null);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Fetch Community Info
        const docRef = doc(db, 'communities', communityId);
        const snap = await getDoc(docRef);
        
        if (!snap.exists()) {
          router.push('/manage/communities');
          return;
        }

        const commData = { id: snap.id, ...snap.data() } as Community;
        setCommunity(commData);

        // 2. Fetch Members
        // Если участников нет, не делаем запрос
        if (commData.members && commData.members.length > 0) {
          // Firestore 'in' query supports up to 10 items (or 30 depending on version).
          // For a real app with >30 members, you'd fetch differently or batch requests.
          // For simplicity here, we assume small groups or fetch all users filtered by managedBy + check manually.
          
          // Вариант А: Простой запрос по ID (работает для <30 участников)
          const chunks = [];
          const memberIds = commData.members;
          const chunkSize = 10;
          for (let i = 0; i < memberIds.length; i += chunkSize) {
              chunks.push(memberIds.slice(i, i + chunkSize));
          }

          const allMembers: UserProfile[] = [];
          for (const chunk of chunks) {
              const q = query(collection(db, 'users'), where(documentId(), 'in', chunk));
              const mSnap = await getDocs(q);
              mSnap.forEach(d => allMembers.push({ uid: d.id, ...d.data() } as UserProfile));
          }
          setMembers(allMembers);
        } else {
            setMembers([]);
        }

      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    if (communityId) fetchData();
  }, [communityId, router]);

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div>;
  }

  if (!community) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <Link href="/manage/communities" className="text-sm text-muted-foreground flex items-center gap-1 hover:text-primary">
            <ArrowLeft className="h-4 w-4" /> {t('Back to Communities')}
        </Link>
        
        <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
                <div className="h-16 w-16 bg-primary/10 rounded-lg flex items-center justify-center border-2 border-primary/20">
                    <Warehouse className="h-8 w-8 text-primary" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold">{community.name}</h1>
                    <p className="text-muted-foreground">{community.description}</p>
                </div>
            </div>
            <Button variant="outline" size="sm">
                <Settings className="mr-2 h-4 w-4" />
                {t('Settings')}
            </Button>
        </div>
      </div>

      <Tabs defaultValue="members">
          <TabsList>
              <TabsTrigger value="members">{t('Members')} ({members.length})</TabsTrigger>
              <TabsTrigger value="stats">{t('Statistics')}</TabsTrigger>
          </TabsList>
          
          <TabsContent value="members" className="mt-4">
             <Card>
                 <CardHeader>
                     <CardTitle>{t('Player Roster')}</CardTitle>
                 </CardHeader>
                 <CardContent>
                    {members.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            {t('No members in this community yet.')}
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {members.map(member => (
                                <div key={member.uid} className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <Avatar>
                                            <AvatarImage src={member.photoURL || undefined} />
                                            <AvatarFallback>{member.name?.[0]}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <div className="font-semibold">{member.name}</div>
                                            <div className="text-xs text-muted-foreground">ELO: {member.globalElo}</div>
                                        </div>
                                    </div>
                                    <Button variant="ghost" size="sm" asChild>
                                        <Link href={`/profile/${member.uid}`}>{t('View Profile')}</Link>
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                 </CardContent>
             </Card>
          </TabsContent>
          
          <TabsContent value="stats">
              <div className="p-10 text-center text-muted-foreground border rounded-lg border-dashed">
                  {t('Community statistics coming soon...')}
              </div>
          </TabsContent>
      </Tabs>
    </div>
  );
}