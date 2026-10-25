import '@/app/globals.css';

import type { Metadata, Viewport } from 'next';
import { Archivo, Poppins, Reddit_Mono } from 'next/font/google';
import { Suspense } from 'react';

import { SimClock } from '@/components/control/SimClock';
import { AppShell } from '@/components/ui/AppShell';
import { ClockIndicator } from '@/components/ui/ClockIndicator';

// Bahn's faces are commercial (Duplet Open, Owners Wide); these are the closest Google fonts.
const poppins = Poppins({
  variable: '--font-poppins',
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
});

const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin', 'latin-ext'],
  axes: ['wdth'],
});

const redditMono = Reddit_Mono({
  variable: '--font-reddit-mono',
  subsets: ['latin', 'latin-ext'],
});

export const metadata: Metadata = {
  title: { default: 'Bahn Control Room', template: '%s · Bahn Control Room' },
  description:
    'Orders that need a person, sorted by when a decision is due. Agents do the legwork, people decide.',
  icons: { icon: '/brand/bahn-mark.svg' },
};

export const viewport: Viewport = {
  themeColor: '#f1eee6',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang='en'
      className={`${poppins.variable} ${archivo.variable} ${redditMono.variable} h-full antialiased`}
    >
      <body className='min-h-full'>
        <AppShell
          right={
            <Suspense fallback={<ClockIndicator simNowMs={null} />}>
              <SimClock />
            </Suspense>
          }
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
