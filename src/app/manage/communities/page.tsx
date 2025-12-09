// src/app/manage/communities/page.tsx
'use client';

import { CreateCommunityDialog } from '@/components/communities/CreateCommunityDialog';
import {
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import type { Community } from '@/lib/types';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Loader2, Plus, Users, Warehouse } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function CommunitiesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    // Загружаем сообщества, где я админ (или владелец, т.к. владелец всегда в admins)
    const q = query(
      collection(db, 'communities'),
      where('admins', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(
        (d) => ({ id: d.id, ...d.data() } as Community)
      );
      // Сортируем по дате создания (новые сверху), если дата есть
      setCommunities(
        docs.sort((a, b) =>
          (b.createdAt || '').localeCompare(a.createdAt || '')
        )
      );
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  if (loading) {
    return (
      <div className='flex justify-center py-10'>
        <Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h2 className='text-xl font-bold'>{t('My Communities')}</h2>
          <p className='text-sm text-muted-foreground'>
            {t('Groups, clubs, and squads you manage.')}
          </p>
        </div>
        {/* Кнопка теперь открывает диалог */}
        <CreateCommunityDialog />
      </div>

      {communities.length === 0 ? (
        <Card className='border-dashed'>
          <CardHeader>
            <CardTitle>{t('No communities yet')}</CardTitle>
            <CardDescription>
              {t(
                'Communities allow you to group players (e.g. "Junior Squad 2008") and assign other coaches to them.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className='flex justify-center py-8'>
            <div className='flex flex-col items-center text-center text-muted-foreground gap-2'>
              <Warehouse className='h-12 w-12 opacity-20' />
              <p>{t('Create your first community to get started.')}</p>
              <div className='mt-2'>
                <CreateCommunityDialog
                  trigger={
                    <Button variant='outline'>
                      <Plus className='mr-2 h-4 w-4' />
                      {t('Create Now')}
                    </Button>
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
          {communities.map((community) => (
            // ДОБАВЛЕН LINK
            <Link
              href={`/manage/communities/${community.id}`}
              key={community.id}
            >
              <Card className='hover:shadow-md transition-shadow cursor-pointer h-full'>
                <CardHeader className='pb-3'>
                  <CardTitle className='text-lg flex items-center gap-2'>
                    <Warehouse className='h-5 w-5 text-primary' />
                    {community.name}
                  </CardTitle>
                  <CardDescription className='line-clamp-2'>
                    {community.description || t('No description')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className='flex items-center gap-4 text-sm text-muted-foreground'>
                    <div className='flex items-center gap-1'>
                      <Users className='h-4 w-4' />
                      <span>
                        {community.members?.length || 0} {t('members')}
                      </span>
                    </div>
                    <div>
                      {t('Created')}: {community.createdAt?.split(' ')[0]}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
