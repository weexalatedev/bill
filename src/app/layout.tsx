import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import '@/index.css';
import Providers from './providers';

// Geist arrives with the design tokens: one family for prose, Geist Mono for every
// figure. next/font self-hosts the files, so there is no runtime request to Google.
const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans', display: 'swap' });
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'EnerOS — AI Energy Manager',
  description: 'EnerOS — the autonomous energy manager for UK SMEs.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
