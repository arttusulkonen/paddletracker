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
import { auth } from '@/lib/firebase';
import { zodResolver } from '@hookform/resolvers/zod';
import { sendPasswordResetEmail } from 'firebase/auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';

const buildSchema = (t: (k: string) => string) =>
  z.object({
    email: z
      .string()
      .trim()
      .min(1, { message: t('Email is required') })
      .email({ message: t('Must be a valid email address') }),
  });

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  const schema = buildSchema(t);
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
    mode: 'onChange',
  });

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (hasMounted) emailInputRef.current?.focus();
  }, [hasMounted]);

  const onSubmit = async (raw: Values) => {
    const data = { email: raw.email.trim() };
    setIsLoading(true);

    if (!auth) {
      toast({
        title: t('Error'),
        description: t(
          'Authentication is currently unavailable. Please try again shortly.'
        ),
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    try {
      await sendPasswordResetEmail(auth, data.email);
      toast({
        title: t('Email sent'),
        description: t(
          'Check your inbox and spam folder for the reset link. The link will expire soon.'
        ),
      });
      router.push('/login');
    } catch (err: any) {
      let msg = t('An unexpected error occurred. Please try again.');
      if (err?.code === 'auth/user-not-found') {
        msg = t('No account found for that email.');
      } else if (err?.code === 'auth/invalid-email') {
        msg = t('Please enter a valid email address.');
      } else if (err?.code === 'auth/too-many-requests') {
        msg = t('Too many attempts. Please wait a moment and try again.');
      } else if (err?.code === 'auth/network-request-failed') {
        msg = t('Network error. Check your connection and try again.');
      }
      toast({
        title: t('Reset failed'),
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!hasMounted) return null;

  return (
    <div className='flex items-center justify-center min-h-[calc(100vh-10rem)] py-12'>
      <Card className='w-full max-w-md shadow-xl'>
        <CardHeader className='text-center'>
          <CardTitle className='text-3xl font-bold'>
            {t('Reset Password')}
          </CardTitle>
          <CardDescription>
            {t(
              "Enter your email and we'll send you a secure link to reset your password."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className='space-y-6'
              noValidate
            >
              <FormField
                control={form.control}
                name='email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Email')}</FormLabel>
                    <FormControl>
                      <Input
                        ref={emailInputRef}
                        type='email'
                        placeholder={t('your@email.com')}
                        inputMode='email'
                        autoComplete='email'
                        aria-describedby='reset-help'
                        {...field}
                      />
                    </FormControl>
                    <p
                      id='reset-help'
                      className='text-xs text-muted-foreground mt-1'
                    >
                      {t(
                        'We will send a one-time link. You can request a new one if it expires.'
                      )}
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type='submit'
                className='w-full'
                disabled={isLoading || !form.formState.isValid}
              >
                {isLoading ? t('Sending…') : t('Send reset link')}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className='flex flex-col items-center gap-2'>
          <p className='text-sm text-muted-foreground'>
            {t('Remembered your password?')}{' '}
            <Button variant='link' asChild className='p-0 h-auto'>
              <Link href='/login'>{t('Log in here')}</Link>
            </Button>
          </p>
          <p className='text-xs text-muted-foreground'>
            {t('No account yet?')}{' '}
            <Button variant='link' asChild className='p-0 h-auto'>
              <Link href='/register'>{t('Create one')}</Link>
            </Button>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
