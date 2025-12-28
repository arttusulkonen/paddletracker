// src/app/register/page.tsx
'use client';

import ImageCropDialog from '@/components/ImageCropDialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { app, auth, db, storage } from '@/lib/firebase';
import { containsProfanity, validateImageFile } from '@/lib/moderation';
import { getFinnishFormattedDate } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { Building2, Ghost, User, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function RegisterPage() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const [hasMounted, setHasMounted] = useState(false);
  const searchParams = useSearchParams();

  const claimUid = searchParams?.get('claim');
  const [ghostUser, setGhostUser] = useState<any>(null);
  const [, setIsClaimLoading] = useState(!!claimUid);

  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

  // Schema definition inside component to use 't'
  const registerSchema = z.object({
    name: z
      .string()
      .trim()
      .min(3, { message: t('Name must be at least 3 characters') })
      .max(30, { message: t('Name must be at most 30 characters') })
      .refine((val) => !containsProfanity(val), {
        message: t('Please choose an appropriate name'),
      }),
    email: z
      .string()
      .trim()
      .email({ message: t('Invalid email address') })
      .toLowerCase(),
    password: z
      .string()
      .min(6, { message: t('Password must be at least 6 characters') }),
    accountType: z.enum(['player', 'coach'], {
      required_error: t('Please select an account type'),
    }),
    reason: z.string().optional(),
    isPublic: z.boolean().default(true),
  });

  type RegisterFormValues = z.infer<typeof registerSchema>;

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      accountType: 'player',
      reason: '',
      isPublic: true,
    },
    mode: 'onTouched',
  });

  useEffect(() => {
    setHasMounted(true);
    if (claimUid && db) {
      const fetchGhost = async () => {
        try {
          const docRef = doc(db!, 'users', claimUid);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            const data = snap.data();
            if (data.isClaimed) {
              toast({
                title: t('Profile already claimed'),
                description: t('This invitation link has already been used.'),
                variant: 'destructive',
              });
              setGhostUser(null);
            } else {
              setGhostUser({ uid: snap.id, ...data });
              form.setValue('name', data.name || data.displayName || '');
              form.setValue('accountType', 'player');
            }
          } else {
            toast({
              title: t('Invalid invitation'),
              description: t('Player profile not found.'),
              variant: 'destructive',
            });
          }
        } catch (e) {
          console.error(e);
        } finally {
          setIsClaimLoading(false);
        }
      };
      fetchGhost();
    }
  }, [claimUid, form, t, toast]);

  const pickAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    
    const { valid, error } = validateImageFile(f);
    if (!valid) {
      toast({ 
        title: t('Unsupported file type'), 
        description: t(error || 'Invalid file'),
        variant: 'destructive' 
      });
      return;
    }

    const src = URL.createObjectURL(f);
    setAvatarSrc(src);
    setCropOpen(true);
  };

  const onCropped = (blob: Blob) => {
    setAvatarBlob(blob);
    const url = URL.createObjectURL(blob);
    setAvatarPreview(url);
  };

  const uploadAvatar = async (uid: string): Promise<string | null> => {
    if (!avatarBlob || !storage) return null;
    const storageRef = ref(storage, `avatars/${uid}/${Date.now()}.jpg`);
    const task = uploadBytesResumable(storageRef, avatarBlob);
    return await new Promise<string | null>((resolve, reject) => {
      task.on(
        'state_changed',
        () => {},
        (err) => reject(err),
        async () => resolve(await getDownloadURL(task.snapshot.ref))
      );
    });
  };

  const onSubmit = async (raw: RegisterFormValues) => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      if (!auth || !db || !app) throw new Error('Service unavailable'); // Check 'app' here
      const data = {
        ...raw,
        name: raw.name.trim(),
        email: raw.email.trim().toLowerCase(),
        reason: raw.reason?.trim() || '',
      };

      const cred = await createUserWithEmailAndPassword(
        auth,
        data.email,
        data.password
      );
      const u = cred.user;

      let photoURL: string | null = null;
      if (avatarBlob) {
        try {
          photoURL = await uploadAvatar(u.uid);
        } catch {}
      } else if (ghostUser?.photoURL) {
        photoURL = ghostUser.photoURL;
      }

      try {
        await updateProfile(u, {
          displayName: data.name,
          photoURL: photoURL ?? undefined,
        });
      } catch {}

      const roles = [data.accountType];
      const newUserRef = doc(db, 'users', u.uid);

      // Создаем "чистый" профиль
      // Никаких данных от госта здесь не копируем, это сделает Cloud Function
      const newUserData: any = {
        uid: u.uid,
        email: u.email,
        displayName: data.name,
        name: data.name,
        createdAt: getFinnishFormattedDate(),
        globalElo: 1000,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        maxRating: 1000,
        eloHistory: [],
        friends: [],
        incomingRequests: [],
        outgoingRequests: [],
        achievements: [],
        rooms: [],
        sports: {
          pingpong: { globalElo: 1000, wins: 0, losses: 0, eloHistory: [] },
          tennis: { globalElo: 1000, wins: 0, losses: 0, eloHistory: [] },
          badminton: { globalElo: 1000, wins: 0, losses: 0, eloHistory: [] },
        },
        roles: roles,
        accountType: data.accountType,
        isPublic: data.isPublic,
        bio: '',
        photoURL: photoURL,
        isDeleted: false,
        approved: true,
        approvalReason: data.reason,
        approvedAt: new Date().toISOString(),
        approvedBy: 'system',
        activeSport: 'pingpong',
      };

      // Сохраняем нового юзера
      await setDoc(newUserRef, newUserData);

      // --- Trigger Cloud Function Migration ---
      // Теперь это ЕДИНСТВЕННОЕ место, где происходит слияние профилей
      if (ghostUser) {
        try {
          // 'app' checked above, so strictly typed now
          const functions = getFunctions(app, 'europe-west1');
          const claimProfileFunc = httpsCallable(
            functions,
            'claimGhostProfile'
          );

          await claimProfileFunc({ ghostId: ghostUser.uid });

          toast({
            title: t('Profile Merged'),
            description: t(
              'Your match history has been successfully transferred.'
            ),
          });
        } catch (migrationError: any) {
          console.error('Migration failed:', migrationError);
          // Аккаунт создан, но миграция не прошла.
          // Можно добавить логику retry или просто сообщить пользователю.
          toast({
            title: t('Warning'),
            description: t(
              'Account created, but history migration failed. Contact support.'
            ),
            variant: 'destructive',
          });
        }
      }
      // ----------------------------------------

      toast({
        title: t('Welcome!'),
        description: t('Your account has been created successfully.'),
      });
      router.replace('/');
    } catch (err: any) {
      console.error(err);
      let description =
        err?.message || t('Something went wrong. Please try again.');
      if (err?.code === 'auth/email-already-in-use') {
        description = t('That email is already in use.');
      }
      toast({
        title: t('Registration Error'),
        description,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onInvalid = (errors: any) => {
    console.error('Form validation errors:', errors);
    toast({
      title: t('Validation Error'),
      description: t('Please check the form fields.'),
      variant: 'destructive',
    });
  };

  if (!hasMounted) return null;

  return (
    <div className='flex items-center justify-center min-h-[calc(100vh-10rem)] py-12'>
      <Card className='w-full max-w-lg shadow-xl border-t-4 border-t-primary'>
        <CardHeader className='text-center pb-2'>
          <CardTitle className='text-3xl font-bold flex items-center justify-center gap-2'>
            {ghostUser ? (
              <>
                <Ghost className='h-8 w-8 text-primary' />
                {t('Claim Profile')}
              </>
            ) : (
              <>
                <UserPlus className='h-8 w-8 text-primary' />
                {t('Create Account')}
              </>
            )}
          </CardTitle>
          <CardDescription>
            {ghostUser
              ? t('You are activating an invited player profile.')
              : t('Join Smashlog to track your matches and stats.')}
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-6'>
          {ghostUser && (
            <div className='bg-primary/10 border border-primary/20 rounded-lg p-4 flex items-center gap-4'>
              <Avatar className='h-12 w-12 border-2 border-primary'>
                <AvatarImage src={ghostUser.photoURL} />
                <AvatarFallback>{ghostUser.name?.[0]}</AvatarFallback>
              </Avatar>
              <div>
                <div className='text-xs text-muted-foreground uppercase font-bold tracking-wider'>
                  {t('Claiming')}
                </div>
                <div className='font-bold text-lg'>{ghostUser.name}</div>
              </div>
            </div>
          )}
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit, onInvalid)}
              className='space-y-6'
            >
              <FormItem className='flex flex-col items-center'>
                <label
                  htmlFor='avatar-upload'
                  className='cursor-pointer group relative'
                >
                  <Avatar className='h-24 w-24 group-hover:opacity-80 transition-opacity'>
                    <AvatarImage src={avatarPreview ?? undefined} />
                    <AvatarFallback>
                      {ghostUser ? (
                        ghostUser.name?.[0]
                      ) : (
                        <UserPlus className='h-10 w-10' />
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className='absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/20 rounded-full text-white text-xs font-medium transition-opacity'>
                    {t('Change')}
                  </div>
                </label>
                <FormControl>
                  <input
                    id='avatar-upload'
                    type='file'
                    className='hidden'
                    accept={ALLOWED_IMAGE_TYPES.join(',')}
                    onChange={pickAvatar}
                    disabled={isLoading}
                  />
                </FormControl>
              </FormItem>

              {!ghostUser && (
                <FormField
                  control={form.control}
                  name='accountType'
                  render={({ field }) => (
                    <FormItem className='space-y-3'>
                      <FormLabel className='text-base'>
                        {t('I am a...')}
                      </FormLabel>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                          className='grid grid-cols-1 sm:grid-cols-2 gap-4'
                        >
                          <div>
                            <RadioGroupItem
                              value='player'
                              id='role-player'
                              className='peer sr-only'
                            />
                            <Label
                              htmlFor='role-player'
                              className='flex flex-col h-full rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer transition-all'
                            >
                              <div className='flex items-center gap-2 mb-2'>
                                <User className='h-5 w-5 text-primary' />
                                <span className='font-bold text-lg'>
                                  {t('Player')}
                                </span>
                              </div>
                              <p className='text-xs text-muted-foreground leading-snug'>
                                {t(
                                  'Play matches, track your stats. Can also create communities & rooms.'
                                )}
                              </p>
                            </Label>
                          </div>
                          <div>
                            <RadioGroupItem
                              value='coach'
                              id='role-coach'
                              className='peer sr-only'
                            />
                            <Label
                              htmlFor='role-coach'
                              className='flex flex-col h-full rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer transition-all'
                            >
                              <div className='flex items-center gap-2 mb-2'>
                                <Building2 className='h-5 w-5 text-primary' />
                                <span className='font-bold text-lg'>
                                  {t('Organizer')}
                                </span>
                              </div>
                              <p className='text-xs text-muted-foreground leading-snug'>
                                {t(
                                  'Manage communities, players & tournaments. Cannot record own match stats.'
                                )}
                              </p>
                            </Label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Display Name')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t('Your Name')} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className='grid grid-cols-1 gap-4'>
                <FormField
                  control={form.control}
                  name='email'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Email')}</FormLabel>
                      <FormControl>
                        <Input type='email' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='password'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Password')}</FormLabel>
                      <FormControl>
                        <Input type='password' {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name='isPublic'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4'>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className='space-y-1 leading-none'>
                      <FormLabel>{t('Make profile public')}</FormLabel>
                      <FormDescription>
                        {t(
                          'Allow other players to find you and see your stats.'
                        )}
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              <Button
                type='submit'
                className='w-full font-bold'
                size='lg'
                disabled={isLoading}
              >
                {isLoading
                  ? t('Processing...')
                  : ghostUser
                  ? t('Activate Profile')
                  : t('Create Account')}
              </Button>
            </form>
          </Form>
        </CardContent>
        <div className='p-6 pt-0 text-center text-sm text-muted-foreground'>
          <Link
            href='/login'
            className='hover:underline hover:text-primary transition-colors'
          >
            {t('Already have an account? Login')}
          </Link>
        </div>
      </Card>
      <ImageCropDialog
        open={cropOpen}
        onOpenChange={setCropOpen}
        image={avatarSrc}
        aspect={1}
        onCropped={onCropped}
        title={t('Adjust image')}
      />
    </div>
  );
}
