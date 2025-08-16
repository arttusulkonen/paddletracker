// src/lib/superAdmins.ts
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

let cache: string[] | null = null;

/**
 * Получить список супер-админов из /config/app.
 * @param force — если true, игнорируем кэш и читаем из Firestore.
 */
export async function getSuperAdminIds(force: boolean = false): Promise<string[]> {
  if (cache && !force) return cache;
  try {
    const snap = await getDoc(doc(db, 'config', 'app'));
    const list =
      snap.exists() && Array.isArray((snap.data() as any)?.superAdminIds)
        ? ((snap.data() as any).superAdminIds as unknown[])
          .filter((x) => typeof x === 'string')
          .map((x) => x.trim())
        : [];

    // Кэшируем ТОЛЬКО непустой список, чтобы случайная пустота не залипала.
    if (list.length > 0) cache = list;
    return list;
  } catch {
    // отдаём кэш, если он был, иначе пустой массив
    return cache ?? [];
  }
}

export function invalidateSuperAdminsCache() {
  cache = null;
}

export function withSuperAdmins(ownerUid: string, extra: string[]): string[] {
  const set = new Set([ownerUid, ...extra]);
  return Array.from(set);
}