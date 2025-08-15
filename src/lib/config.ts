// src/lib/config.ts
export const ADMIN_UID = 'NoYtP49TLoUHOiNEcknW63cw2mw2';

export const isAdmin = (uid: string | undefined): boolean => {
  return uid === ADMIN_UID;
};