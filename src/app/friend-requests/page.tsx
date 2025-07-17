'use client';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ScrollArea,
} from '@/components/ui';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import * as Friends from '@/lib/friends';
import { doc, getDoc } from 'firebase/firestore';
import { Check, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type LiteUser = { uid: string; name: string; photoURL?: string };

export default function FriendRequestsPage() {
  const { t } = useTranslation();
  const { user, userProfile } = useAuth();
  const [requests, setRequests] = useState<LiteUser[]>([]);
  const [loading, setLoading] = useState(true);

  // 🛡️ 1. Состояние для защиты от гидратации
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    // 🛡️ 2. Устанавливаем, что компонент смонтирован
    setHasMounted(true);

    const load = async () => {
      if (!userProfile) return;
      const incoming = userProfile.incomingRequests ?? [];
      const arr: LiteUser[] = [];
      for (const uid of incoming) {
        const snap = await getDoc(doc(db, 'users', uid));
        if (snap.exists()) {
          const d = snap.data() as any;
          arr.push({
            uid,
            name: d.name ?? d.email ?? t('Unknown'),
            photoURL: d.photoURL,
          });
        }
      }
      setRequests(arr);
      setLoading(false);
    };

    load();
  }, [userProfile, t]);

  const handle = async (uid: string, accept: boolean) => {
    if (!user) return;
    if (accept) await Friends.acceptRequest(user.uid, uid);
    else await Friends.rejectRequest(user.uid, uid);
    setRequests((prev) => prev.filter((p) => p.uid !== uid));
  };

  // 🛡️ 3. "Страж", который предотвращает рендер до монтирования на клиенте
  if (!hasMounted) {
    return null;
  }

  return (
    <div className='container mx-auto py-8 max-w-xl'>
      <Card>
        <CardHeader>
          <CardTitle>{t('Friend requests')}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className='text-center py-6'>{t('Loading…')}</p>
          ) : requests.length === 0 ? (
            <p className='text-center py-6'>{t('No new requests 🎉')}</p>
          ) : (
            <ScrollArea className='h-[400px] pr-3'>
              <ul className='space-y-4'>
                {requests.map((r) => (
                  <li key={r.uid} className='flex items-center justify-between'>
                    <div className='flex items-center gap-3'>
                      <Avatar className='h-10 w-10'>
                        <AvatarImage src={r.photoURL || undefined} />
                        <AvatarFallback>{r.name[0]}</AvatarFallback>
                      </Avatar>
                      <Link
                        href={`/profile/${r.uid}`}
                        className='font-medium hover:underline'
                      >
                        {r.name}
                      </Link>
                    </div>

                    <div className='flex gap-2'>
                      <Button
                        size='icon'
                        variant='outline'
                        onClick={() => handle(r.uid, false)}
                      >
                        <X className='h-4 w-4 text-destructive' />
                      </Button>
                      <Button size='icon' onClick={() => handle(r.uid, true)}>
                        <Check className='h-4 w-4' />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
