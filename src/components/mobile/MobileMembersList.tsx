// src/components/mobile/MobileMembersList.tsx
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
import { Users } from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface MobileMembersListProps {
  members: any[];
}

export function MobileMembersList({ members }: MobileMembersListProps) {
  const { t } = useTranslation();

  const sortedMembers = React.useMemo(() => {
    return [...members].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  }, [members]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-xl flex items-center gap-2'>
          <Users className='h-5 w-5' /> {t('Ranking')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='space-y-2'>
          {sortedMembers.map((p, index) => (
            <div
              key={p.userId}
              className='flex items-center justify-between p-2 bg-muted/50 rounded-md'
            >
              <div className='flex items-center gap-3'>
                <span className='font-mono text-sm w-6 text-center'>
                  {index + 1}
                </span>
                <Avatar className='h-10 w-10'>
                  <AvatarImage src={p.photoURL || undefined} />
                  <AvatarFallback>{p.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <p className='font-medium'>{p.name}</p>
              </div>
              <span className='text-base font-bold text-primary'>
                {Math.round(p.rating)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
