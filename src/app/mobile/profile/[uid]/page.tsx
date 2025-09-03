'use client';

import MobileEditProfileSheet from '@/components/mobile/profile/MobileEditProfileSheet';
import MobileMatchesList from '@/components/mobile/profile/MobileMatchesList';
import MobileProfileHeader from '@/components/mobile/profile/MobileProfileHeader';
import MobileStatTiles from '@/components/mobile/profile/MobileStatTiles';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { Sport, sportConfig, useSport } from '@/contexts/SportContext';
import { db } from '@/lib/firebase';
import type { Match, UserProfile } from '@/lib/types';
import { parseFlexDate } from '@/lib/utils/date';
import { getRank } from '@/lib/utils/profileUtils';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function MobileProfilePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { uid } = useParams<{ uid: string }>();
  const { user, isGlobalAdmin } = useAuth();
  const { sport, setSport, config } = useSport();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const [editOpen, setEditOpen] = useState(false);

  const isSelf = user?.uid === uid;

  useEffect(() => {
    (async () => {
      setLoading(true);
      const snap = await getDoc(doc(db, 'users', uid));
      if (!snap.exists() || (snap.data() as any)?.isDeleted) {
        router.replace('/');
        return;
      }
      const p = { uid, ...(snap.data() as UserProfile) } as UserProfile;
      setProfile(p);
      if (p.activeSport) setSport?.(p.activeSport);
      setLoading(false);
    })();
  }, [uid, router, setSport]);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const coll = sportConfig[sport].collections.matches;
      const qy = query(
        collection(db, coll),
        where('players', 'array-contains', uid),
        orderBy('tsIso', 'desc'),
        limit(20)
      );
      const snap = await getDocs(qy);
      const list = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as any) } as Match)
      );
      setMatches(list);
    })();
  }, [uid, profile, sport]);

  const sportElo = profile?.sports?.[sport]?.globalElo ?? 1000;
  const rank = useMemo(() => getRank(sportElo, t), [sportElo, t]);

  if (loading || !profile) {
    return (
      <div className='flex items-center justify-center min-h-screen'>
        <div className='animate-spin h-12 w-12 rounded-full border-b-2 border-primary' />
      </div>
    );
  }

  const total =
    (profile.sports?.[sport]?.wins ?? 0) +
    (profile.sports?.[sport]?.losses ?? 0);
  const winRate =
    total > 0 ? ((profile.sports?.[sport]?.wins ?? 0) / total) * 100 : 0;

  return (
    <div className='container mx-auto px-2 py-4 space-y-4'>
      <Button asChild variant='ghost' className='mb-1'>
        <Link href='/mobile'>
          <ArrowLeft className='mr-2 h-4 w-4' />
          {t('Back')}
        </Link>
      </Button>

      <MobileProfileHeader
        profile={profile}
        rank={rank ?? t('Unranked')}
        isSelf={isSelf}
        onEdit={() => setEditOpen(true)}
      />

      <Card>
        <CardHeader className='pb-2'>
          <CardTitle className='text-base'>{t('Sport')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={sport} onValueChange={(v) => setSport?.(v as Sport)}>
            <SelectTrigger className='w-full'>
              <SelectValue placeholder={t('Select a sport')} />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(sportConfig) as Sport[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {sportConfig[key].name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <MobileStatTiles
        elo={sportElo}
        winRate={winRate}
        totalMatches={total}
        wins={profile.sports?.[sport]?.wins ?? 0}
        losses={profile.sports?.[sport]?.losses ?? 0}
      />

      <MobileMatchesList sport={sport} matches={matches} meUid={uid} />

      {isSelf && (
        <MobileEditProfileSheet
          open={editOpen}
          onOpenChange={setEditOpen}
          profile={profile}
          onUpdated={async () => {
            const snap = await getDoc(doc(db, 'users', uid));
            if (snap.exists())
              setProfile({ uid, ...(snap.data() as UserProfile) });
          }}
        />
      )}
    </div>
  );
}
