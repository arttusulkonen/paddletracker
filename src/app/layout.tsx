import Providers from '@/app/providers';
import InstallPrompt from '@/components/pwa/InstallPrompt';
import PWAInit from '@/components/pwa/PWAInit';
import DynamicTitle from '@/components/seo/DynamicTitle';
import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#22c55e', 
};

export const metadata: Metadata = {
  title: 'Smashlog',
  description: 'Track matches, manage tournaments, and analyze your ELO.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/icons/favicon-128.png', sizes: '128x128', type: 'image/png' },
      {
        url: '/icons/favicon-196x196.png',
        sizes: '196x196',
        type: 'image/png',
      },
      { url: '/icons/favicon.ico', rel: 'shortcut icon' },
    ],
    apple: [
      {
        url: '/icons/apple-touch-icon-152x152.png',
        sizes: '152x152',
        type: 'image/png',
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Smashlog',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang='en' suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased flex flex-col min-h-screen`}
      >
        <Providers>
          <PWAInit />
          <DynamicTitle />
          <InstallPrompt />
          {children}
        </Providers>
      </body>
    </html>
  );
}
