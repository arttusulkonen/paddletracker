// src/components/profile/ProfileHeader.tsx
'use client';

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
	Badge,
	Button,
	Card,
	Dialog,
	DialogTrigger,
	Separator,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui';
import { useSport } from '@/contexts/SportContext';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/lib/types';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import {
	Briefcase,
	Check,
	Edit,
	Globe,
	Lock,
	Medal,
	Trophy,
	UserMinus,
	UserPlus,
	Warehouse,
	X,
} from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProfileSettingsDialog } from './ProfileSettingsDialog';

interface ProfileHeaderProps {
  targetProfile: UserProfile;
  friendStatus: 'none' | 'outgoing' | 'incoming' | 'friends';
  handleFriendAction: (action: 'add' | 'cancel' | 'accept' | 'remove') => void;
  isSelf: boolean;
  isManager?: boolean;
  rank: string | null;
  medalSrc: string | null;
  onUpdate: () => void;
}

export function ProfileHeader({
  targetProfile,
  friendStatus,
  handleFriendAction,
  isSelf,
  isManager,
  rank,
  medalSrc,
  onUpdate,
}: ProfileHeaderProps) {
  const { t } = useTranslation();
  const { sport } = useSport();
  
  const [communityName, setCommunityName] = useState<string | null>(null);

  const displayName = targetProfile.displayName ?? targetProfile.name ?? t('Unknown Player');
  const elo = targetProfile.sports?.[sport]?.globalElo ?? 1000;
  
  const isCoach = targetProfile.accountType === 'coach' || targetProfile.roles?.includes('coach');

  useEffect(() => {
    const fetchCommunity = async () => {
      if (targetProfile.communityIds && targetProfile.communityIds.length > 0) {
        try {
          const cDoc = await getDoc(doc(db!, 'communities', targetProfile.communityIds[0]));
          if (cDoc.exists()) {
            setCommunityName(cDoc.data().name);
            return;
          }
        } catch (error) {
          console.error("Failed to load community by ID", error);
        }
      }

      try {
        if (!db) return;
        const q = query(
          collection(db, 'communities'),
          where('admins', 'array-contains', targetProfile.uid),
          limit(1)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          setCommunityName(snap.docs[0].data().name);
        }
      } catch (error) {
        console.error("Failed to find managed community", error);
      }
    };
    fetchCommunity();
  }, [targetProfile.communityIds, targetProfile.uid]);

  return (
    <Card className='mb-10 shadow-2xl overflow-hidden border-0 rounded-[2.5rem] glass-panel relative'>
      <div className='absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent mix-blend-overlay pointer-events-none' />
      <div className='absolute top-0 left-0 w-full h-1.5 opacity-80 bg-gradient-to-r from-primary to-purple-600' />
      
      <div className='relative px-6 py-10 md:px-12 z-10'>
        <div className='flex flex-col md:flex-row gap-8 items-start md:items-center'>
          
          <div className='flex-shrink-0 relative group'>
            <Avatar className='h-28 w-28 md:h-36 md:w-36 ring-4 ring-white/40 dark:ring-black/20 shadow-2xl overflow-hidden bg-background/50 backdrop-blur-sm'>
              <AvatarImage
                src={targetProfile.photoURL ?? undefined}
                className='object-cover'
              />
              <AvatarFallback className='text-5xl font-light bg-transparent text-muted-foreground'>
                {displayName[0]}
              </AvatarFallback>
            </Avatar>
            
            {medalSrc && !isCoach && (
              <div className='absolute -bottom-2 -right-2 bg-background/80 backdrop-blur-md rounded-full p-1.5 shadow-lg ring-1 ring-black/5 dark:ring-white/10 md:hidden'>
                <Image
                  src={medalSrc}
                  alt='Rank'
                  width={40}
                  height={40}
                  className='w-10 h-10'
                />
              </div>
            )}
          </div>

          <div className='flex-grow space-y-5 min-w-0 w-full'>
            <div className='flex flex-col md:flex-row md:items-start justify-between gap-6'>
              <div className='space-y-3'>
                <div className='flex items-center gap-3 flex-wrap'>
                  <h1 className='text-4xl md:text-5xl font-extrabold tracking-tight text-foreground truncate'>
                    {displayName}
                  </h1>
                  
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge 
                          variant="outline" 
                          className="gap-1.5 px-3 py-1 text-[10px] uppercase font-bold tracking-widest text-muted-foreground border-0 bg-background/50 backdrop-blur-md shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                        >
                          {targetProfile.isPublic ? (
                            <>
                              <Globe className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">{t('Public')}</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">{t('Private')}</span>
                            </>
                          )}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="glass-panel border-0 font-medium">
                        {targetProfile.isPublic 
                          ? t('Visible to everyone') 
                          : t('Only visible to friends')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {communityName && (
                    <Badge variant="outline" className="gap-1.5 px-3 py-1 text-[10px] uppercase font-bold tracking-widest bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-0 ring-1 ring-indigo-500/30">
                       <Warehouse className="w-3.5 h-3.5" />
                       <span className="truncate max-w-[150px]">{communityName}</span>
                    </Badge>
                  )}

                  {isCoach && (
                    <Badge className="bg-indigo-500 hover:bg-indigo-600 gap-1.5 text-white px-3 py-1 text-[10px] uppercase font-bold tracking-widest border-0 shadow-md">
                       <Briefcase className="w-3.5 h-3.5" /> {t('Organizer')}
                    </Badge>
                  )}

                  {isManager && (
                    <Badge variant="secondary" className="gap-1.5 px-3 py-1 text-[10px] uppercase font-bold tracking-widest bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-0 ring-1 ring-emerald-500/30">
                       {t('Managed by You')}
                    </Badge>
                  )}
                </div>

                {targetProfile.bio && (
                  <p className='text-muted-foreground text-sm md:text-base font-light leading-relaxed max-w-2xl'>
                    {targetProfile.bio}
                  </p>
                )}
              </div>

              <div className='flex items-center gap-3 flex-shrink-0 mt-2 md:mt-0'>
                {isSelf || isManager ? (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant='outline' size='lg' className='gap-2 rounded-full h-12 border-0 bg-background/50 backdrop-blur-md shadow-sm ring-1 ring-black/5 dark:ring-white/10 hover:bg-background/80 transition-all font-semibold'>
                        <Edit className='h-4 w-4' />
                        <span className='hidden sm:inline'>{t('Edit Profile')}</span>
                      </Button>
                    </DialogTrigger>
                    <ProfileSettingsDialog
                      profile={targetProfile}
                      onUpdate={onUpdate}
                    />
                  </Dialog>
                ) : (
                  <>
                    {friendStatus === 'none' && (
                      <Button
                        size='lg'
                        onClick={() => handleFriendAction('add')}
                        className='gap-2 rounded-full h-12 shadow-lg font-semibold px-6 hover:scale-105 transition-transform'
                      >
                        <UserPlus className='h-5 w-5' /> {t('Add Friend')}
                      </Button>
                    )}
                    {friendStatus === 'outgoing' && (
                      <Button
                        size='lg'
                        variant='secondary'
                        onClick={() => handleFriendAction('cancel')}
                        className='gap-2 rounded-full h-12 font-semibold px-6'
                      >
                        <X className='h-5 w-5' /> {t('Cancel Request')}
                      </Button>
                    )}
                    {friendStatus === 'incoming' && (
                      <div className='flex gap-2'>
                        <Button
                          size='lg'
                          className='gap-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full h-12 font-semibold px-6 shadow-lg hover:scale-105 transition-transform'
                          onClick={() => handleFriendAction('accept')}
                        >
                          <Check className='h-5 w-5' /> {t('Accept')}
                        </Button>
                        <Button
                          size='icon'
                          variant='outline'
                          className="h-12 w-12 rounded-full border-0 bg-background/50 backdrop-blur-md shadow-sm ring-1 ring-black/5 dark:ring-white/10 hover:bg-destructive/10 hover:text-destructive transition-all"
                          onClick={() => handleFriendAction('remove')}
                        >
                          <X className='h-5 w-5' />
                        </Button>
                      </div>
                    )}
                    {friendStatus === 'friends' && (
                      <Button
                        size='lg'
                        variant='outline'
                        className='gap-2 rounded-full h-12 font-semibold px-6 border-0 bg-background/50 backdrop-blur-md shadow-sm ring-1 ring-black/5 dark:ring-white/10 hover:bg-destructive/10 hover:text-destructive transition-all'
                        onClick={() => handleFriendAction('remove')}
                      >
                        <UserMinus className='h-5 w-5' /> {t('Unfriend')}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>

            {!isCoach && (
              <>
                <Separator className='bg-black/5 dark:bg-white/5 my-6' />
                <div className='flex flex-wrap items-center gap-x-8 gap-y-4'>
                  <div className='flex items-center gap-3'>
                    {medalSrc ? (
                      <div className="bg-background/50 p-2 rounded-xl backdrop-blur-sm ring-1 ring-black/5 dark:ring-white/10 shadow-sm">
                        <Image
                          src={medalSrc}
                          alt={rank || 'Rank'}
                          width={32}
                          height={32}
                          className='w-8 h-8'
                        />
                      </div>
                    ) : (
                      <div className="bg-primary/10 p-2.5 rounded-xl ring-1 ring-primary/20">
                        <Trophy className='w-6 h-6 text-primary' />
                      </div>
                    )}
                    <div className='flex flex-col'>
                      <span className='text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-0.5'>{t('Rank')}</span>
                      <span className='font-bold text-lg leading-none tracking-tight'>{rank || t('Unranked')}</span>
                    </div>
                  </div>

                  <div className='w-px h-10 bg-black/10 dark:bg-white/10 hidden sm:block' />

                  <div className='flex items-center gap-3'>
                    <div className='p-2.5 bg-primary/10 rounded-xl ring-1 ring-primary/20 text-primary'>
                      <Medal className='w-6 h-6' />
                    </div>
                    <div className='flex flex-col'>
                      <span className='text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-0.5'>ELO</span>
                      <span className='font-black text-2xl leading-none text-primary tracking-tight'>{elo.toFixed(0)}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}