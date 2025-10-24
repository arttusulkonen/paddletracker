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
import { zodResolver } from '@hookform/resolvers/zod';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { AlertCircle, CheckCircle2, LogIn } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';

let loginSchema: any;
type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const qp = useSearchParams();
  const next = qp?.get('next') || '/';
  const pending = qp?.get('pending');

  loginSchema = z.object({
    email: z.string().email({ message: t('Invalid email address') }),
    password: z
      .string()
      .min(6, { message: t('Password must be at least 6 characters') }),
  });

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onTouched',
  });

  useEffect(() => {
    if (pending) {
      toast({
        title: t('Account pending approval'),
        description: t(
          'Your registration is awaiting admin approval. You will be able to sign in after approval.'
        ),
      });
    }
  }, [pending, toast, t]);

  const policyBullets = useMemo(
    () => [
      t('⚠️ This project is currently in beta testing.'),
      t(
        '✅ Registration is limited — new accounts must be approved by an administrator.'
      ),
      t(
        '⏳ Approval may take some time. You cannot log in until your account is approved.'
      ),
      t(
        '💡 If you see “email already in use”, it may mean your registration is still pending approval.'
      ),
    ],
    [t]
  );

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(
        auth,
        data.email,
        data.password
      );

      // --- НАЧАЛО ИСПРАВЛЕНИЯ ---

      const snap = await getDoc(doc(db, 'users', cred.user.uid));
      const userData = snap.exists() ? (snap.data() as any) : null;

      // Блокируем вход, ТОЛЬКО если поле 'approved' существует и равно 'false'.
      // Если поле 'approved' равно 'true' или 'undefined' (отсутствует), вход разрешен.
      const isPending = userData && userData.approved === false;

      if (isPending) {
        await signOut(auth);
        router.replace('/login?pending=1');
        toast({
          title: t('Account not approved yet'),
          description: t(
            'Your account exists but is waiting for admin approval.'
          ),
          variant: 'destructive',
        });
        return; // Останавливаем выполнение
      }

      // Дополнительная проверка: если аутентификация прошла, а документа нет
      if (!userData) {
        await signOut(auth);
        console.error(
          'Login error: User authenticated but no document found in Firestore.',
          cred.user.uid
        );
        toast({
          title: t('Login Failed'),
          description: t(
            'Your user profile could not be found. Please contact support.'
          ),
          variant: 'destructive',
        });
        return; // Останавливаем выполнение
      }

      // Вход успешен (для approved: true и approved: undefined)
      toast({ title: t('Login Successful'), description: t('Welcome back!') });
      router.push(next);

      // --- КОНЕЦ ИСПРАВЛЕНИЯ ---
    } catch (error: any) {
      let errorMessage = t('An unexpected error occurred. Please try again.');
      if (
        error.code === 'auth/user-not-found' ||
        error.code === 'auth/wrong-password' ||
        error.code === 'auth/invalid-credential'
      ) {
        errorMessage = t('Invalid email or password. Please try again.');
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = t(
          'Too many attempts. Please wait a moment and try again.'
        );
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
  useEffect(() => setHasMounted(true), []);
  if (!hasMounted) return null;

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

        <CardContent className='space-y-6'>
          <div className='rounded-md border p-3 text-sm bg-muted/30'>
            <div className='flex items-start gap-2'>
              <AlertCircle className='h-4 w-4 mt-0.5 text-primary' />
              <div className='text-left space-y-1'>
                <p className='font-medium'>{t('Important information')}</p>
                <ul className='list-disc pl-4 space-y-1 text-muted-foreground'>
                  {policyBullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

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
                        autoComplete='email'
                        inputMode='email'
                        disabled={isLoading}
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
                        autoComplete='current-password'
                        disabled={isLoading}
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

        <CardFooter className='flex flex-col items-center space-y-3'>
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

          <div className='flex items-center gap-2 text-xs text-muted-foreground'>
            <CheckCircle2 className='h-4 w-4' />
            <span>
              {t(
                'This project is in beta. Admin approval is required for all new accounts.'
              )}
            </span>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
