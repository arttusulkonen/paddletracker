// src/app/terms/page.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

export default function TermsOfServicePage() {
  const { t } = useTranslation();

  return (
    <div className='container mx-auto max-w-4xl py-12 px-4'>
      <Card>
        <CardHeader>
          <CardTitle className='text-3xl'>{t('Terms of Service')}</CardTitle>
        </CardHeader>
        <CardContent className='prose dark:prose-invert max-w-none'>
          <p>
            <strong>{t('Last updated')}: 30 August 2025</strong>
          </p>

          <p>
            {t(
              'These Terms of Service (the "Terms") govern your access to and use of the Smashlog service (the "Service"). By accessing or using the Service, you agree to be bound by these Terms.'
            )}
          </p>

          <h2 className='text-2xl font-semibold mt-6'>{t('1. Who we are')}</h2>
          <p>
            {t(
              'The Service is operated by Arttu Sulkonen. For contact details, please see the Privacy Policy.'
            )}
          </p>

          <h2 className='text-2xl font-semibold mt-6'>{t('2. Eligibility')}</h2>
          <p>
            {t(
              'You must be at least 16 years old (or the minimum age required in your country to consent to data processing) to use the Service.'
            )}
          </p>

          <h2 className='text-2xl font-semibold mt-6'>
            {t('3. Your account')}
          </h2>
          <ul>
            <li>
              {t(
                'You must provide accurate, current, and complete information when creating an account and keep it up to date.'
              )}
            </li>
            <li>
              {t(
                'You are responsible for safeguarding your password and for all activities under your account.'
              )}
            </li>
            <li>
              {t(
                'We may suspend or terminate your account if you breach these Terms or our policies.'
              )}
            </li>
          </ul>

          <h2 className='text-2xl font-semibold mt-6'>
            {t('4. Acceptable use')}
          </h2>
          <ul>
            <li>
              {t(
                'Do not upload or share content that is illegal, infringing, defamatory, harassing, hateful, or otherwise objectionable.'
              )}
            </li>
            <li>
              {t(
                'Do not attempt to access others’ accounts, interfere with the Service, or bypass security measures.'
              )}
            </li>
            <li>
              {t(
                'You must respect the privacy of other users and only process their personal data in accordance with the law.'
              )}
            </li>
          </ul>

          <h2 className='text-2xl font-semibold mt-6'>
            {t('5. Content and licenses')}
          </h2>
          <ul>
            <li>
              {t(
                'You retain ownership of content you submit. You grant us a worldwide, non-exclusive, royalty-free license to host, store, display, and process the content solely to provide and improve the Service.'
              )}
            </li>
            <li>
              {t(
                'You represent that you have all rights necessary to submit the content and that it does not infringe third-party rights.'
              )}
            </li>
          </ul>

          <h2 className='text-2xl font-semibold mt-6'>
            {t('6. Paid features and ads')}
          </h2>
          <p>
            {t(
              'The Service may include advertisements and may offer paid features in the future. Advertising partners may use cookies or similar technologies; see the Privacy Policy for details.'
            )}
          </p>

          <h2 className='text-2xl font-semibold mt-6'>
            {t('7. Third-party services')}
          </h2>
          <p>
            {t(
              'We use third-party services such as Firebase (Google Cloud) for hosting and data storage and Google Analytics for analytics. Your use of the Service is also subject to those providers’ terms and policies where applicable.'
            )}
          </p>

          <h2 className='text-2xl font-semibold mt-6'>{t('8. Disclaimers')}</h2>
          <p>
            {t(
              'The Service is provided on an "AS IS" and "AS AVAILABLE" basis. We disclaim all warranties to the maximum extent permitted by law.'
            )}
          </p>

          <h2 className='text-2xl font-semibold mt-6'>
            {t('9. Limitation of liability')}
          </h2>
          <p>
            {t(
              'To the extent permitted by law, we will not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses.'
            )}
          </p>

          <h2 className='text-2xl font-semibold mt-6'>
            {t('10. Suspension and termination')}
          </h2>
          <p>
            {t(
              'We may suspend or terminate your access to the Service at any time if we believe you violated these Terms or applicable law.'
            )}
          </p>

          <h2 className='text-2xl font-semibold mt-6'>
            {t('11. Governing law')}
          </h2>
          <p>
            {t(
              'These Terms are governed by the laws of Finland, without regard to conflict of law principles. Consumers may have mandatory rights under local law.'
            )}
          </p>

          <h2 className='text-2xl font-semibold mt-6'>{t('12. Changes')}</h2>
          <p>
            {t(
              'We may update these Terms from time to time. Material changes will be notified within the Service. Continued use after changes means you accept the updated Terms.'
            )}
          </p>

          <p className='mt-8'>
            {t('Please also review our')}{' '}
            <Link href='/privacy' className='text-primary underline'>
              {t('Privacy Policy')}
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
