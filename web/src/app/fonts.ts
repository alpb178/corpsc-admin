import { DM_Sans, Fraunces, JetBrains_Mono } from 'next/font/google';

// Matches the group's typography (invoice-gen/web/src/app/fonts.ts): DM Sans
// for body/UI, Fraunces for display headings, JetBrains Mono for tight
// mono labels (see .font-serif-display / .font-mono-tight in globals.css).
const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  weight: ['400', '500', '600'],
  display: 'swap',
});

export const fontVariables = `${dmSans.variable} ${fraunces.variable} ${jetbrainsMono.variable}`;
