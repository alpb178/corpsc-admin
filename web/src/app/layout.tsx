import type { Metadata } from 'next';
import { ToastProvider } from '@/components/Toast';
import { fontVariables } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'CORPSC Hub',
  description: 'Analítica y KPIs de los sitios del grupo CORPSC',
  robots: { index: false, follow: false }, // internal panel
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={fontVariables}>
      <body className="font-sans antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
