// src/app/privacy/page.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

export default function PrivacyPolicyPage() {
  const { t } = useTranslation();

  return (
    <div className='container mx-auto max-w-4xl py-12 px-4'>
      <Card>
        <CardHeader>
          <CardTitle className='text-3xl'>{t('Privacy Policy')}</CardTitle>
        </CardHeader>
        <CardContent className='prose dark:prose-invert max-w-none'>
          <p>
            <strong>{t('Last updated')}: 30 August 2025</strong>
          </p>

          <p>
            {t(
              'This Privacy Policy explains how Smashlog (the "Service") collects, uses, discloses, and protects personal data. We process personal data in accordance with the EU/EEA General Data Protection Regulation (GDPR).'
            )}
          </p>

          <h2 className='text-2xl font-semibold mt-6'>
            {t('1. Data controller')}
          </h2>
          <p>{t('Controller: Arttu Sulkonen')}</p>
          <ul>
            <li>
              {t('Contact email')}:{' '}
              <a href='mailto:arttu.sulkonen@icloud.com'>
                arttu.sulkonen@icloud.com
              </a>
            </li>
          </ul>

          <h2 className='text-2xl font-semibold mt-6'>
            {t('2. What data we collect')}
          </h2>
          <ul>
            <li>
              <strong>{t('Account data')}:</strong>{' '}
              {t(
                'email address, display name, optional profile picture, optional bio, account status and approvals.'
              )}
            </li>
            <li>
              <strong>{t('Usage data')}:</strong>{' '}
              {t(
                'matches, scores, ELO ratings, rooms and memberships, achievements, friends, requests, timestamps.'
              )}
            </li>
            <li>
              <strong>{t('Device and log information')}:</strong>{' '}
              {t(
                'IP address, device identifiers, browser/OS, language, date/time, referring pages.'
              )}
            </li>
            <li>
              <strong>{t('Cookies and similar technologies')}:</strong>{' '}
              {t(
                'HTTP cookies, local storage, and similar identifiers used for authentication, preferences, analytics, and advertising (if enabled).'
              )}
            </li>
          </ul>

          <h2 className='text-2xl font-semibold mt-6'>
            {t('3. Why we process your data (legal bases)')}
          </h2>
          <ul>
            <li>
              <strong>{t('To provide the Service (contract)')}:</strong>{' '}
              {t(
                'authenticate users, store profiles and matches, manage rooms, compute rankings.'
              )}
            </li>
            <li>
              <strong>
                {t('To keep the Service secure (legitimate interests)')}:
              </strong>{' '}
              {t('fraud prevention, abuse monitoring, service integrity.')}
            </li>
            <li>
              <strong>
                {t('Analytics and performance (consent, where required)')}:
              </strong>{' '}
              {t(
                'Google Analytics or similar to understand usage and improve features.'
              )}
            </li>
            <li>
              <strong>{t('Advertising (consent)')}:</strong>{' '}
              {t(
                'if we display ads, cookies/IDs may be used by us and our partners for ad delivery and measurement.'
              )}
            </li>
            <li>
              <strong>{t('Legal obligations')}:</strong>{' '}
              {t('respond to lawful requests and comply with applicable laws.')}
            </li>
          </ul>

          <h2 className='text-2xl font-semibold mt-6'>
            {t('4. Cookies and consent')}
          </h2>
          <p>
            {t(
              'We use cookies and similar technologies for strictly necessary purposes (e.g., login), and—only with your consent—for analytics and advertising. You can manage or withdraw consent at any time via the Cookie Settings link (if available) or by adjusting your browser settings.'
            )}
          </p>
          <ul>
            <li>
              <strong>{t('Strictly necessary')}:</strong>{' '}
              {t('authentication, security, core functionality.')}
            </li>
            <li>
              <strong>{t('Analytics (consent)')}:</strong>{' '}
              {t('usage statistics to improve the Service.')}
            </li>
            <li>
              <strong>{t('Advertising (consent)')}:</strong>{' '}
              {t(
                'personalized or contextual ads, frequency capping, and measurement.'
              )}
            </li>
          </ul>

          <h2 className='text-2xl font-semibold mt-6'>
            {t('5. Processors and third parties')}
          </h2>
          <ul>
            <li>
              <strong>{t('Firebase / Google Cloud')}:</strong>{' '}
              {t(
                'we use Firebase Authentication, Firestore, Storage, and related Google Cloud services to host and store data. Data is primarily processed in europe-west1 (Belgium) for Firestore/Functions; Storage may use multi-region configurations.'
              )}
            </li>
            <li>
              <strong>{t('Google Analytics (GA)')}:</strong>{' '}
              {t(
                'for usage analytics. GA may set cookies and collect device/usage information. Where required, GA runs only after you give consent. You can opt out via your consent settings or browser add-ons.'
              )}
            </li>
            <li>
              <strong>{t('Advertising partners (if enabled)')}:</strong>{' '}
              {t(
                'ad networks may use cookies/IDs for ad delivery and measurement, subject to your consent and their own privacy policies.'
              )}
            </li>
            <li>
              <strong>{t('reCAPTCHA / abuse protection (if enabled)')}:</strong>{' '}
              {t('to protect the Service from spam and abuse.')}
            </li>
          </ul>

          <h2 className='text-2xl font-semibold mt-6'>
            {t('6. International data transfers')}
          </h2>
          <p>
            {t(
              'Personal data may be processed outside your country, including outside the EEA, for example when using Google services. Where applicable, we rely on EU Standard Contractual Clauses and other safeguards required by law.'
            )}
          </p>

          <h2 className='text-2xl font-semibold mt-6'>
            {t('7. Data retention')}
          </h2>
          <p>
            {t(
              'We retain personal data for as long as necessary to provide the Service, comply with legal obligations, resolve disputes, and enforce agreements. Usage records (e.g., match history) may be retained in anonymized or aggregated form.'
            )}
          </p>

          <h2 className='text-2xl font-semibold mt-6'>
            {t('8. Your rights under GDPR')}
          </h2>
          <ul>
            <li>
              <strong>{t('Access')}:</strong>{' '}
              {t('request a copy of your personal data.')}
            </li>
            <li>
              <strong>{t('Rectification')}:</strong>{' '}
              {t('correct inaccurate or incomplete data.')}
            </li>
            <li>
              <strong>{t('Erasure')}:</strong>{' '}
              {t(
                'request deletion of your personal data ("right to be forgotten").'
              )}
            </li>
            <li>
              <strong>{t('Restriction')}:</strong>{' '}
              {t('request restriction of processing in certain cases.')}
            </li>
            <li>
              <strong>{t('Portability')}:</strong>{' '}
              {t(
                'receive your data in a structured, commonly used, machine-readable format.'
              )}
            </li>
            <li>
              <strong>{t('Objection')}:</strong>{' '}
              {t(
                'object to processing based on legitimate interests and to direct marketing.'
              )}
            </li>
            <li>
              <strong>{t('Withdraw consent')}:</strong>{' '}
              {t(
                'where processing is based on consent (e.g., analytics/ads), you may withdraw it at any time.'
              )}
            </li>
          </ul>
          <p>
            {t(
              'You can exercise many of these rights in the app (profile/settings). For other requests, contact us at the email above. We will respond as required by law.'
            )}
          </p>

          <h2 className='text-2xl font-semibold mt-6'>
            {t('9. Children’s privacy')}
          </h2>
          <p>
            {t(
              'The Service is not directed to children under 16. If you believe a child has provided personal data, contact us to remove it.'
            )}
          </p>

          <h2 className='text-2xl font-semibold mt-6'>
            {t('10. Automated decision-making')}
          </h2>
          <p>
            {t(
              'We do not engage in automated decision-making producing legal or similarly significant effects. Rankings and ELO calculations are automated scoring features within the Service.'
            )}
          </p>

          <h2 className='text-2xl font-semibold mt-6'>
            {t('11. How we secure data')}
          </h2>
          <p>
            {t(
              'We apply technical and organizational measures appropriate to the risk, including authentication and role-based access controls. However, no method of transmission or storage is 100% secure.'
            )}
          </p>

          <h2 className='text-2xl font-semibold mt-6'>{t('12. Complaints')}</h2>
          <p>
            {t(
              'You can lodge a complaint with your local data protection authority. In Finland, the supervisory authority is the Office of the Data Protection Ombudsman.'
            )}
          </p>

          <h2 className='text-2xl font-semibold mt-6'>
            {t('13. Changes to this policy')}
          </h2>
          <p>
            {t(
              'We may update this Privacy Policy from time to time. Material changes will be notified within the Service. Continued use after changes means you acknowledge the updated Policy.'
            )}
          </p>

          <p className='mt-8'>
            {t('See also our')}{' '}
            <Link href='/terms' className='text-primary underline'>
              {t('Terms of Service')}
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
