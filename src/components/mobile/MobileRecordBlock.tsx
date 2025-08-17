// src/components/mobile/MobileRecordBlock.tsx
'use client';

import { MobileBadmintonRecordBlock } from '@/components/mobile/record-blocks/MobileBadmintonRecordBlock';
import { MobilePingPongRecordBlock } from '@/components/mobile/record-blocks/MobilePingPongRecordBlock';
import { MobileTennisRecordBlock } from '@/components/mobile/record-blocks/MobileTennisRecordBlock';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { useSport } from '@/contexts/SportContext';
import type { Room } from '@/lib/types';
import { useTranslation } from 'react-i18next';

export function MobileRecordBlock({
  members,
  roomId,
  room,
}: {
  members: Room['members'];
  roomId: string;
  room: Room & { sport?: string };
}) {
  const { t } = useTranslation();
  const { sport: contextSport } = useSport();

  const sport =
    (room.sport as string) ?? (contextSport as string) ?? 'pingpong';

  if (sport === 'pingpong') {
    return (
      <MobilePingPongRecordBlock
        members={members}
        roomId={roomId}
        room={room}
      />
    );
  }
  if (sport === 'badminton') {
    return (
      <MobileBadmintonRecordBlock
        members={members}
        roomId={roomId}
        room={room}
      />
    );
  }
  if (sport === 'tennis') {
    return (
      <MobileTennisRecordBlock members={members} roomId={roomId} room={room} />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Record Matches')}</CardTitle>
      </CardHeader>
      <CardContent>{t('Recording matches is not available yet.')}</CardContent>
    </Card>
  );
}
