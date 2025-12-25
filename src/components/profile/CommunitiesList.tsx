// src/components/profile/CommunitiesList.tsx
'use client';

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@/components/ui';
import { db } from '@/lib/firebase';
import type { Community } from '@/lib/types';
import { collection, getDocs, or, query, where } from 'firebase/firestore';
import { Warehouse } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface CommunitiesListProps {
  targetUid: string;
}

const PREVIEW_COUNT = 4;

export function CommunitiesList({ targetUid }: CommunitiesListProps) {
  const { t } = useTranslation();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCommunities = async () => {
      setLoading(true);
      try {
        // ИСПРАВЛЕНИЕ: Используем 'or', чтобы найти сообщества, где пользователь
        // является участником ИЛИ админом ИЛИ владельцем.
        // Это гарантирует, что мы ничего не пропустим.
        const q = query(
          collection(db, 'communities'),
          or(
            where('members', 'array-contains', targetUid),
            where('admins', 'array-contains', targetUid),
            where('ownerId', '==', targetUid)
          )
        );
        
        const snap = await getDocs(q);
        
        // Firestore автоматически дедублирует документы в рамках одного запроса 'or',
        // но на всякий случай маппинг не помешает.
        const comms = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() } as Community)
        );
        setCommunities(comms);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchCommunities();
  }, [targetUid]);

  if (loading) {
    return <Card className='h-32 animate-pulse bg-muted/50' />;
  }

  if (communities.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-lg flex items-center gap-2'>
          <Warehouse className='h-5 w-5 text-indigo-500' />
          {t('Communities')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='space-y-3'>
          {communities.slice(0, PREVIEW_COUNT).map((comm) => (
            <Link
              href={`/manage/communities/${comm.id}`}
              key={comm.id}
              className='flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors border border-transparent hover:border-border'
            >
              <Avatar className='h-10 w-10 border'>
                <AvatarImage src={comm.avatarURL ?? undefined} />
                <AvatarFallback className='bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300'>
                  {comm.name[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className='font-semibold text-sm leading-tight'>
                  {comm.name}
                </p>
                <p className='text-xs text-muted-foreground'>
                  {comm.members?.length || 0} {t('members')}
                </p>
              </div>
            </Link>
          ))}
        </div>
        {communities.length > PREVIEW_COUNT && (
           <div className="mt-4 text-center">
              <p className="text-xs text-muted-foreground italic">
                 {t('+ {{count}} more', { count: communities.length - PREVIEW_COUNT })}
              </p>
           </div>
        )}
      </CardContent>
    </Card>
  );
}