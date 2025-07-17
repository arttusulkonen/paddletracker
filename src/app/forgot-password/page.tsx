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

let forgotSchema: any;
type ForgotFormValues = z.infer<typeof forgotSchema>;

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // 🛡️ 1. Состояние для защиты от гидратации
  const [hasMounted, setHasMounted] = useState(false);

  forgotSchema = z.object({
    email: z.string().email({ message: t('Must be a valid email address') }),
  });

  const form = useForm<ForgotFormValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  // 🛡️ 2. Эффект, который запускается только на клиенте
  useEffect(() => {
    setHasMounted(true);
  }, []);

  const onSubmit = async (data: ForgotFormValues) => {
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, data.email);
      toast({
        title: t('Email Sent'),
        description: t('Check your inbox for the reset link.'),
      });
      router.push('/login');
    } catch (err: any) {
      console.error('Reset error:', err);
      toast({
        title: t('Reset Failed'),
        description:
          err.code === 'auth/user-not-found'
            ? t('No account found for that email.')
            : err.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 🛡️ 3. "Страж", который предотвращает рендер до монтирования на клиенте
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
