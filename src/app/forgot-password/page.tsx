// src/app/forgot-password/page.tsx
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
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';

// ✅ Схема вынесена за пределы компонента для стабильности
const getForgotSchema = (t: (key: string) => string) =>
  z.object({
    email: z.string().email({ message: t('Must be a valid email address') }),
  });

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  // ✅ Схема инициализируется один раз
  const forgotSchema = getForgotSchema(t);
  type ForgotFormValues = z.infer<typeof forgotSchema>;

  const form = useForm<ForgotFormValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const onSubmit = async (data: ForgotFormValues) => {
    setIsLoading(true);

    // ✅ Добавлена проверка на наличие объекта auth
    if (!auth) {
      toast({
        title: t('Error'),
        description:
          'Authentication service is not available. Please try again later.',
        variant: 'destructive',
      });
      setIsLoading(false);
      return;
    }

    try {
      await sendPasswordResetEmail(auth, data.email);
      toast({
        title: t('Email Sent'),
        description: t('Check your inbox for the reset link.'),
      });
      router.push('/login');
    } catch (err: any) {
      console.error('Password reset error:', err);
      toast({
        title: t('Reset Failed'),
        description:
          err.code === 'auth/user-not-found'
            ? t('No account found for that email.')
            : t('An unexpected error occurred. Please try again.'),
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
          <CardTitle className='text-3xl font-bold'>
            {t('Reset Password')}
          </CardTitle>
          <CardDescription>
            {t("Enter your email and we'll send you a reset link.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
              <FormField
                control={form.control}
                name='email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Email')}</FormLabel>
                    <FormControl>
                      <Input
                        type='email'
                        placeholder={t('your@email.com')}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type='submit' className='w-full' disabled={isLoading}>
                {isLoading ? t('Sending…') : t('Send Reset Link')}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className='flex flex-col items-center space-y-2'>
          <p className='text-sm text-muted-foreground'>
            {t('Remembered your password?')}
            <Button variant='link' asChild className='p-0 h-auto'>
              <Link href='/login'>{t('Log in here')}</Link>
            </Button>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
