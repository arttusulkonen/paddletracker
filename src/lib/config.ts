// src/lib/config.ts
export const ADMIN_UID = process.env.NEXT_PUBLIC_ADMIN_UID as string;

export const isAdmin = (uid: string | undefined): boolean => {
  return uid === ADMIN_UID;
};