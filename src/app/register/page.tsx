// src/app/register/page.tsx
'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { auth, db } from '@/lib/firebase';
import { getFinnishFormattedDate } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';

let registerSchema: any;
type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const [hasMounted, setHasMounted] = useState(false);

  registerSchema = z.object({
    name: z
      .string()
      .min(3, { message: t('Name must be at least 3 characters') })
      .max(30, { message: t('Name must be at most 30 characters') }),
    email: z.string().email({ message: t('Invalid email address') }),
    password: z
      .string()
      .min(6, { message: t('Password must be at least 6 characters') }),
  });

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
    },
  });

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const onSubmit = async (data: RegisterFormValues) => {
    setIsLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        data.email,
        data.password
      );
      const u = cred.user;

      await updateProfile(u, { displayName: data.name });

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
        isPublic: true,
        bio: '',
        friends: [],
        incomingRequests: [],
        outgoingRequests: [],
        achievements: [],
        rooms: [],
      });

      toast({
        title: t('Success!'),
        description: t('Your account has been created.'),
      });
      router.push('/');
    } catch (err: any) {
      console.error(err);
      toast({
        title: t('Registration Error'),
        description:
          err.code === 'auth/email-already-in-use'
            ? t('That email address is already in use.')
            : t('Something went wrong. Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!hasMounted) {
    return null;
  }

  return (
    <div className='flex items-center justify-center min-h-[calc(100vh-10rem)] py-12'>
      <Card className='w-full max-w-md shadow-xl'>
        <CardHeader className='text-center'>
          <CardTitle className='text-3xl font-bold flex items-center justify-center gap-2'>
            <UserPlus className='h-8 w-8 text-primary' /> {t('Create Account')}
          </CardTitle>
          <CardDescription>
            {t('Join PingPongTracker and start tracking your games!')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
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
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type='submit' className='w-full' disabled={isLoading}>
                {isLoading ? t('Registering...') : t('Register')}
              </Button>
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
  );
}
