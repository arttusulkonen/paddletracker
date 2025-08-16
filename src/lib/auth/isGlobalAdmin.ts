// src/lib/auth/isGlobalAdmin.ts
import { auth } from '@/lib/firebase';

export async function isGlobalAdminClient(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    const token = await user.getIdTokenResult(true); // force refresh
    return token.claims?.admin === true;
  } catch {
    return false;
  }
}