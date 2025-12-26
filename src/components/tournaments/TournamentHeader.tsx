'use client';

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
	Button,
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
	Dialog,
	DialogTrigger,
} from '@/components/ui';
import type { TournamentRoom } from '@/lib/types';
import { Settings } from 'lucide-react';
import { TournamentSettingsDialog } from './TournamentSettings';

interface Props {
  tournament: TournamentRoom;
  isCreator: boolean;
}

export function TournamentHeader({ tournament, isCreator }: Props) {

  return (
    <Card className='mb-8 shadow-xl'>
      <CardHeader className='bg-muted/50 p-6 flex flex-col md:flex-row items-center gap-6 md:justify-between'>
        <div className='flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left'>
          <Avatar className='h-20 w-20 md:h-24 md:w-24 border-4 border-background shadow-md'>
            <AvatarImage src={(tournament as any).avatarURL || undefined} />
            <AvatarFallback>{tournament.name?.[0] ?? '?'}</AvatarFallback>
          </Avatar>
          <div className='flex-grow'>
            <CardTitle className='text-2xl md:text-3xl font-bold'>
              {tournament.name}
            </CardTitle>
            {(tournament as any).description && (
              <CardDescription className='mt-1 max-w-xl'>
                {(tournament as any).description}
              </CardDescription>
            )}
          </div>
        </div>

        {isCreator && (
          <div className='w-full md:w-auto flex justify-end'>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant='outline' size='icon'>
                  <Settings className='h-4 w-4' />
                </Button>
              </DialogTrigger>
              <TournamentSettingsDialog tournament={tournament} />
            </Dialog>
          </div>
        )}
      </CardHeader>
    </Card>
  );
}
