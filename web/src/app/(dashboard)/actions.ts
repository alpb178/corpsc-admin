'use server';

import { redirect } from 'next/navigation';
import { clearSession } from '@/lib/session';

export async function logout(): Promise<void> {
  await clearSession();
  redirect('/login');
}
