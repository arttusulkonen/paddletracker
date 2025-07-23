// src/app/terms/page.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { useTranslation } from 'react-i18next';

export default function TermsOfServicePage() {
  const { t } = useTranslation();

  return (
    <div className="container mx-auto max-w-4xl py-12 px-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">{t('Terms of Service')}</CardTitle>
        </CardHeader>
        <CardContent className="prose dark:prose-invert max-w-none">
          <p>
            <strong>{t('Last updated')}: 23 July 2025</strong>
          </p>
          <p>
            {t(
              'Please read these terms and conditions carefully before using Our Service.'
            )}
          </p>

          <h2 className="text-2xl font-semibold mt-6">{t('1. Acknowledgment')}</h2>
          <p>
            {t(
              'These are the Terms and Conditions governing the use of this Service and the agreement that operates between You and Arttu Sulkonen. By accessing or using the Service You agree to be bound by these Terms and Conditions.'
            )}
          </p>

          <h2 className="text-2xl font-semibold mt-6">{t('2. User Accounts')}</h2>
          <p>
            {t(
              'When you create an account with us, you must provide us with information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your account on our Service.'
            )}
          </p>
          <p>
            {t(
              'You are responsible for safeguarding the password that you use to access the Service and for any activities or actions under your password.'
            )}
          </p>

          <h2 className="text-2xl font-semibold mt-6">{t('3. User Conduct')}</h2>
          <p>
            {t(
              'You agree not to use the Service to post or transmit any material which is defamatory, offensive, or of an obscene or menacing character, or which may, in our judgment, cause annoyance, inconvenience or needless anxiety to any person.'
            )}
          </p>

          <h2 className="text-2xl font-semibold mt-6">{t('4. Termination')}</h2>
          <p>
            {t(
              'We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach these Terms and Conditions.'
            )}
          </p>
          <p>
            {t(
              'Upon termination, your right to use the Service will cease immediately. You can terminate your account via the profile settings page.'
            )}
          </p>

          <h2 className="text-2xl font-semibold mt-6">{t('5. Limitation of Liability')}</h2>
          <p>
            {t(
              'The Service is provided on an "AS IS" and "AS AVAILABLE" basis. We make no warranties, expressed or implied, and hereby disclaim and negate all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.'
            )}
          </p>

          <h2 className="text-2xl font-semibold mt-6">{t('6. Governing Law')}</h2>
          <p>
            {t(
              'The laws of Finland, excluding its conflicts of law rules, shall govern this Terms and Your use of the Service.'
            )}
          </p>

          <h2 className="text-2xl font-semibold mt-6">{t('7. Changes to These Terms')}</h2>
          <p>
            {t(
              'We reserve the right, at our sole discretion, to modify or replace these Terms at any time. We will try to provide at least 30 days\' notice prior to any new terms taking effect.'
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}