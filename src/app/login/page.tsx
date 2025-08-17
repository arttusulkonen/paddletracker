// src/app/login/page.tsx
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
import { signInWithEmailAndPassword } from 'firebase/auth';
import { LogIn } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';

// Schema needs to be defined inside the component to access the `t` function
let loginSchema: any;
type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  // Define the schema inside the component to use the `t` function for messages
  loginSchema = z.object({
    email: z.string().email({ message: t('Invalid email address') }),
    password: z
      .string()
      .min(6, { message: t('Password must be at least 6 characters') }),
  });

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, data.email, data.password);
      toast({
        title: t('Login Successful'),
        description: t('Welcome back!'),
      });
      router.push('/');
    } catch (error: any) {
      console.error('Login error:', error);
      let errorMessage = t('An unexpected error occurred. Please try again.');
      if (
        error.code === 'auth/user-not-found' ||
        error.code === 'auth/wrong-password' ||
        error.code === 'auth/invalid-credential'
      ) {
        errorMessage = t('Invalid email or password. Please try again.');
      }
      toast({
        title: t('Login Failed'),
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return null;
  }

  return (
    <div className='flex items-center justify-center min-h-[calc(100vh-10rem)] py-12'>
      <Card className='w-full max-w-md shadow-xl'>
        <CardHeader className='text-center'>
          <CardTitle className='text-3xl font-bold flex items-center justify-center gap-2'>
            <LogIn className='h-8 w-8 text-primary' />
            {t('Login to Smashlog')}
          </CardTitle>
          <CardDescription>
            {t('Enter your credentials to access your account.')}
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
              <FormField
                control={form.control}
                name='password'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Password')}</FormLabel>
                    <FormControl>
                      <Input
                        type='password'
                        placeholder='••••••••'
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type='submit' className='w-full' disabled={isLoading}>
                {isLoading ? t('Logging in...') : t('Login')}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className='flex flex-col items-center space-y-2'>
          <p className='text-sm text-muted-foreground'>
            {t("Don't have an account?")}{' '}
            <Button variant='link' asChild className='p-0 h-auto'>
              <Link href='/register'>{t('Register here')}</Link>
            </Button>
          </p>

          <p className='text-sm text-muted-foreground'>
            <Button variant='link' asChild className='p-0 h-auto'>
              <Link href='/forgot-password'>{t('Forgot your password?')}</Link>
            </Button>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
