// src/app/register/page.tsx
'use client';

import ImageCropDialog from '@/components/ImageCropDialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { auth, db, storage } from '@/lib/firebase';
import { getFinnishFormattedDate } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { AlertCircle, CheckCircle2, Shield, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';

let registerSchema: any;
type RegisterFormValues = z.infer<typeof registerSchema>;

const AVATAR_MAX_MB = 2;
const AVATAR_MAX_BYTES = AVATAR_MAX_MB * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function RegisterPage() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const [hasMounted, setHasMounted] = useState(false);

  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

  registerSchema = z.object({
    name: z
      .string()
      .trim()
      .min(3, { message: t('Name must be at least 3 characters') })
      .max(30, { message: t('Name must be at most 30 characters') }),
    email: z
      .string()
      .trim()
      .email({ message: t('Invalid email address') })
      .toLowerCase(),
    password: z
      .string()
      .min(6, { message: t('Password must be at least 6 characters') }),
    reason: z
      .string()
      .trim()
      .min(10, { message: t('Please provide at least 10 characters') }),
    isPublic: z.boolean().default(true),
    terms: z.boolean().refine((val) => val === true, {
      message: t('You must accept the terms and conditions'),
    }),
  });

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      reason: '',
      terms: false,
      isPublic: true,
    },
    mode: 'onTouched',
  });

  useEffect(() => setHasMounted(true), []);

  const policyBullets = useMemo(
    () => [
      t('This app is currently in closed beta.'),
      t('New accounts require manual admin approval before sign-in.'),
      t('Describe briefly how you plan to use the app to speed up approval.'),
    ],
    [t]
  );

  const pickAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (!f) return;
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const fileExtension = f.name
      .substring(f.name.lastIndexOf('.'))
      .toLowerCase();

    const isValidType =
      allowedMimeTypes.includes(f.type) ||
      allowedExtensions.includes(fileExtension);

    if (!isValidType) {
      toast({
        title: t('Unsupported file type'),
        description: t('Please upload a JPG, PNG, or WEBP image.'),
        variant: 'destructive',
      });
      return;
    }
    if (f.size > AVATAR_MAX_BYTES) {
      toast({
        title: t('File is too large'),
        description: t('Please select an image smaller than {{mb}}MB.', {
          mb: AVATAR_MAX_MB.toString(),
        }),
        variant: 'destructive',
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
      if (!auth || !db) throw new Error('Service unavailable');
      const data = {
        ...raw,
        name: raw.name.trim(),
        email: raw.email.trim().toLowerCase(),
        reason: raw.reason.trim(),
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
      }
      try {
        await updateProfile(u, {
          displayName: data.name,
          photoURL: photoURL ?? undefined,
        });
      } catch {}
      const userRef = doc(db, 'users', u.uid);
      await setDoc(userRef, {
        uid: u.uid,
        email: u.email,
        displayName: data.name,
        name: data.name,
        globalElo: 1000,
        maxRating: 1000,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        createdAt: getFinnishFormattedDate(),
        eloHistory: [],
        friends: [],
        incomingRequests: [],
        outgoingRequests: [],
        achievements: [],
        rooms: [],
        isPublic: data.isPublic,
        bio: '',
        photoURL: photoURL,
        isDeleted: false,
        approved: false,
        approvalReason: data.reason,
        approvedAt: null,
        approvedBy: null,
        activeSport: 'pingpong',
      });
      try {
        await signOut(auth);
      } catch {}
      toast({
        title: t('Registration submitted'),
        description: t(
          'Your account is pending admin approval. You will be able to sign in after approval.'
        ),
      });
      router.replace('/login?pending=1');
    } catch (err: any) {
      let description =
        err?.message || t('Something went wrong. Please try again.');
      if (err?.code === 'auth/email-already-in-use') {
        description = t(
          'That email is already in use. If you registered earlier, your account may still be waiting for approval or you can reset your password.'
        );
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

  if (!hasMounted) return null;

  return (
    <>
      <div className='flex items-center justify-center min-h-[calc(100vh-10rem)] py-12'>
        <Card className='w-full max-w-md shadow-xl'>
          <CardHeader className='text-center'>
            <CardTitle className='text-3xl font-bold flex items-center justify-center gap-2'>
              <UserPlus className='h-8 w-8 text-primary' />{' '}
              {t('Create Account')}
            </CardTitle>
            <CardDescription>
              {t(
                'Registration requires admin approval. Please tell why you want access. You will be able to sign in after approval.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-6'>
            <div className='rounded-md border p-3 text-sm'>
              <div className='flex items-start gap-2'>
                <Shield className='h-4 w-4 mt-0.5 text-primary' />
                <div className='text-left space-y-1'>
                  <p className='font-medium'>{t('Before you register')}</p>
                  <ul className='list-disc pl-4 space-y-1 text-muted-foreground'>
                    {policyBullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                  <div className='flex items-center gap-2 text-xs text-muted-foreground pt-1'>
                    <CheckCircle2 className='h-4 w-4' />
                    <span>
                      {t('Admin approval policy is in effect for this app.')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className='space-y-6'
              >
                <FormItem className='flex flex-col items-center'>
                  <FormLabel>{t('Profile Picture (Optional)')}</FormLabel>
                  <label htmlFor='avatar-upload' className='cursor-pointer'>
                    <Avatar className='h-24 w-24'>
                      <AvatarImage src={avatarPreview ?? undefined} />
                      <AvatarFallback>
                        <UserPlus className='h-10 w-10' />
                      </AvatarFallback>
                    </Avatar>
                  </label>
                  <FormControl>
                    <Input
                      id='avatar-upload'
                      type='file'
                      className='hidden'
                      accept={ALLOWED_IMAGE_TYPES.join(',')}
                      onChange={pickAvatar}
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormDescription className='text-xs text-muted-foreground'>
                    {t('Max {{mb}}MB. JPG, PNG, or WEBP.', {
                      mb: AVATAR_MAX_MB.toString(),
                    })}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
                <FormField
                  control={form.control}
                  name='name'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Display Name')}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={t('Your Name')}
                          autoComplete='name'
                          disabled={isLoading}
                          maxLength={30}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='email'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Email')}</FormLabel>
                      <FormControl>
                        <Input
                          type='email'
                          {...field}
                          placeholder={t('you@example.com')}
                          autoComplete='email'
                          inputMode='email'
                          disabled={isLoading}
                        />
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
                        <Input
                          type='password'
                          {...field}
                          placeholder='••••••••'
                          autoComplete='new-password'
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='reason'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Why do you want access?')}</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder={t(
                            'Tell us briefly who you are and why you need access. The project is currently in closed beta testing. But if you have specific plans for using it, please let us know.'
                          )}
                          rows={4}
                          disabled={isLoading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='isPublic'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-start space-x-3 space-y-0'>
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={isLoading}
                        />
                      </FormControl>
                      <div className='space-y-1 leading-none'>
                        <FormLabel>{t('Public Profile')}</FormLabel>
                        <FormDescription>
                          {t(
                            'Your profile and stats will be visible to other players.'
                          )}
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='terms'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-start space-x-3 space-y-0'>
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={isLoading}
                        />
                      </FormControl>
                      <div className='space-y-1 leading-none'>
                        <FormLabel>
                          {t('I agree to the')}{' '}
                          <Link
                            href='/terms'
                            className='text-primary hover:underline'
                            target='_blank'
                          >
                            {t('Terms of Service')}
                          </Link>{' '}
                          {t('and')}{' '}
                          <Link
                            href='/privacy'
                            className='text-primary hover:underline'
                            target='_blank'
                          >
                            {t('Privacy Policy')}
                          </Link>
                          .
                        </FormLabel>
                        <FormMessage />
                      </div>
                    </FormItem>
                  )}
                />
                <Button type='submit' className='w-full' disabled={isLoading}>
                  {isLoading ? t('Registering...') : t('Register')}
                </Button>
                <div className='flex items-start gap-2 text-xs text-muted-foreground'>
                  <AlertCircle className='h-4 w-4' />
                  <span>
                    {t(
                      'After submitting, you will be signed out until an admin approves your account.'
                    )}
                  </span>
                </div>
              </form>
            </Form>
          </CardContent>
          <CardFooter className='flex flex-col items-center space-y-2'>
            <p className='text-sm text-muted-foreground'>
              {t('Already have an account?')}{' '}
              <Button variant='link' asChild className='p-0 h-auto'>
                <Link href='/login'>{t('Log in here')}</Link>
              </Button>
            </p>
          </CardFooter>
        </Card>
      </div>
      <ImageCropDialog
        open={cropOpen}
        onOpenChange={setCropOpen}
        image={avatarSrc}
        aspect={1}
        onCropped={onCropped}
        title={t('Adjust image')}
      />
    </>
  );
}
