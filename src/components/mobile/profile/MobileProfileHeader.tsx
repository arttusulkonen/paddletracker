'use client';

import { Avatar, AvatarFallback, AvatarImage, Button, Card, CardContent } from '@/components/ui';
import type { UserProfile } from '@/lib/types';
import { Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function MobileProfileHeader({
  profile,
  rank,
  isSelf,
  onEdit,
}: {
  profile: UserProfile;
  rank: string;
  isSelf: boolean;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const displayName = profile.displayName || profile.name || t('Unknown Player');

  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Avatar className="h-16 w-16">
          <AvatarImage src={profile.photoURL ?? undefined} />
          <AvatarFallback>{displayName.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold truncate">{displayName}</h1>
            {isSelf && (
              <Button size="icon" variant="outline" aria-label={t('Edit Profile')} onClick={onEdit}>
                <Settings className="h-4 w-4" />
              </Button>
            )}
          </div>
          {profile.email && isSelf && (
            <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
          )}
          <div className="mt-2 inline-flex items-center gap-2 rounded bg-muted px-2 py-0.5 text-xs">
            <span className="font-medium">{rank}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}