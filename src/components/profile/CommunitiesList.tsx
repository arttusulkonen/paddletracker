'use client';

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
	Card,
	CardContent,
} from '@/components/ui';
import { db } from '@/lib/firebase';
import type { Community } from '@/lib/types';
import { collection, getDocs, query, where } from 'firebase/firestore';
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
        // Find communities where targetUid is an admin or owner
        const q = query(
          collection(db, 'communities'),
          where('admins', 'array-contains', targetUid)
        );
        const snap = await getDocs(q);
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
    return <Card className='h-24 animate-pulse bg-muted border-none shadow-none'></Card>;
  }

  if (communities.length === 0) {
    return null;
  }

  return (
    <Card className='border-none shadow-none p-0 mt-6'>
      <div className='flex items-center gap-2 mb-3 px-1'>
         <Warehouse className="h-4 w-4 text-muted-foreground" />
         <h4 className='text-sm font-semibold text-muted-foreground'>{t('Communities')}</h4>
      </div>
      <CardContent className='p-0'>
        <div className='space-y-3'>
          {communities.slice(0, PREVIEW_COUNT).map((comm) => (
            <Link
              href={`/manage/communities/${comm.id}`}
              key={comm.id}
              className='flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors'
            >
              <Avatar className='h-10 w-10'>
                <AvatarImage src={comm.avatarURL ?? undefined} />
                <AvatarFallback className="bg-primary/10 text-primary">{comm.name[0]}</AvatarFallback>
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
      </CardContent>
    </Card>
  );
}