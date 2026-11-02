import type { Metadata } from 'next';
import '@/index.css';
import Providers from './providers';

export const metadata: Metadata = {
  title: 'EnerOS — AI Energy Manager',
  description: 'EnerOS — the autonomous energy manager for UK SMEs.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
