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

  // Логика загрузки названия сообщества
  useEffect(() => {
    const fetchCommunity = async () => {
      // 1. Сначала проверяем, есть ли ID в профиле (быстрый способ)
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

      // 2. Если в профиле нет ID, ищем сообщество, где этот пользователь АДМИН (для тренеров)
      // Это решает проблему, когда в User.communityIds пусто, но в Community.admins он есть
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

  const theme = {
    bg: 'bg-gradient-to-r from-slate-50 to-white dark:from-slate-950/50 dark:to-background',
    border: 'border-slate-200 dark:border-slate-800',
  };

  return (
    <Card className={`mb-8 shadow-sm overflow-hidden border ${theme.border}`}>
      <div className={`px-6 py-8 md:px-8 ${theme.bg}`}>
        <div className='flex flex-col md:flex-row gap-8 items-start'>
          
          {/* Avatar Area */}
          <div className='flex-shrink-0 relative group'>
            <Avatar className='h-28 w-28 md:h-32 md:w-32 border-4 border-background shadow-md ring-1 ring-border/50'>
              <AvatarImage
                src={targetProfile.photoURL ?? undefined}
                className='object-cover'
              />
              <AvatarFallback className='text-4xl bg-muted text-muted-foreground'>
                {displayName[0]}
              </AvatarFallback>
            </Avatar>
            
            {/* Medal Overlay (Only for Players) */}
            {medalSrc && !isCoach && (
              <div className='absolute -bottom-2 -right-2 bg-background rounded-full p-1 shadow-sm border border-border md:hidden'>
                <Image
                  src={medalSrc}
                  alt='Rank'
                  width={32}
                  height={32}
                  className='w-8 h-8'
                />
              </div>
            )}
          </div>

          {/* Info Area */}
          <div className='flex-grow space-y-4 min-w-0 w-full'>
            <div className='flex flex-col md:flex-row md:items-start justify-between gap-4'>
              <div className='space-y-1'>
                <div className='flex items-center gap-3 flex-wrap'>
                  <h1 className='text-3xl md:text-4xl font-bold tracking-tight text-foreground truncate'>
                    {displayName}
                  </h1>
                  
                  {/* Public/Private Badge */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge 
                          variant="outline" 
                          className="gap-1.5 px-2 py-0.5 text-muted-foreground font-normal border-border/60 bg-background/50"
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
                      <TooltipContent>
                        {targetProfile.isPublic 
                          ? t('Visible to everyone') 
                          : t('Only visible to friends')}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  {/* Community Badge (Now shown for EVERYONE including coaches) */}
                  {communityName && (
                    <Badge variant="secondary" className="gap-1.5 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300 hover:bg-indigo-100 border border-indigo-100 dark:border-indigo-900">
                       <Warehouse className="w-3.5 h-3.5" />
                       {communityName}
                    </Badge>
                  )}

                  {/* Coach Badge */}
                  {isCoach && (
                    <Badge className="bg-indigo-500 hover:bg-indigo-600 gap-1 text-white">
                       <Briefcase className="w-3.5 h-3.5" /> {t('Organizer')}
                    </Badge>
                  )}

                  {/* Manager Badge */}
                  {isManager && (
                    <Badge variant="secondary" className="gap-1">
                       {t('Managed by You')}
                    </Badge>
                  )}
                </div>

                {targetProfile.bio && (
                  <p className='text-muted-foreground text-sm leading-relaxed max-w-xl'>
                    {targetProfile.bio}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className='flex items-center gap-2 flex-shrink-0'>
                {isSelf || isManager ? (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant='outline' size='sm' className='gap-2'>
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
                        size='sm'
                        onClick={() => handleFriendAction('add')}
                        className='gap-2 shadow-sm'
                      >
                        <UserPlus className='h-4 w-4' /> {t('Add Friend')}
                      </Button>
                    )}
                    {friendStatus === 'outgoing' && (
                      <Button
                        size='sm'
                        variant='secondary'
                        onClick={() => handleFriendAction('cancel')}
                        className='gap-2'
                      >
                        <X className='h-4 w-4' /> {t('Cancel Request')}
                      </Button>
                    )}
                    {friendStatus === 'incoming' && (
                      <div className='flex gap-2'>
                        <Button
                          size='sm'
                          className='gap-2 bg-green-600 hover:bg-green-700 text-white'
                          onClick={() => handleFriendAction('accept')}
                        >
                          <Check className='h-4 w-4' /> {t('Accept')}
                        </Button>
                        <Button
                          size='sm'
                          variant='ghost'
                          onClick={() => handleFriendAction('remove')}
                        >
                          <X className='h-4 w-4' />
                        </Button>
                      </div>
                    )}
                    {friendStatus === 'friends' && (
                      <Button
                        size='sm'
                        variant='outline'
                        className='gap-2 text-muted-foreground hover:text-destructive hover:border-destructive/50'
                        onClick={() => handleFriendAction('remove')}
                      >
                        <UserMinus className='h-4 w-4' /> {t('Unfriend')}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>

            <Separator className='bg-border/50' />

            {/* Meta Stats Row - HIDE FOR COACHES */}
            {!isCoach && (
              <div className='flex flex-wrap items-center gap-x-6 gap-y-3 text-sm'>
                <div className='flex items-center gap-2'>
                  {medalSrc ? (
                    <Image
                      src={medalSrc}
                      alt={rank || 'Rank'}
                      width={24}
                      height={24}
                      className='w-6 h-6'
                    />
                  ) : (
                    <Trophy className='w-5 h-5 text-amber-500' />
                  )}
                  <div className='flex flex-col'>
                    <span className='text-xs text-muted-foreground uppercase font-bold tracking-wider'>{t('Rank')}</span>
                    <span className='font-semibold'>{rank || t('Unranked')}</span>
                  </div>
                </div>

                <div className='w-px h-8 bg-border/50 hidden sm:block' />

                <div className='flex items-center gap-2'>
                  <div className='p-1.5 bg-primary/10 rounded-full text-primary'>
                    <Medal className='w-4 h-4' />
                  </div>
                  <div className='flex flex-col'>
                    <span className='text-xs text-muted-foreground uppercase font-bold tracking-wider'>ELO</span>
                    <span className='font-semibold text-lg leading-none'>{elo}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}