// scripts/set-super-admins.ts
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';

function parseArgs() {
  const args = process.argv.slice(2);
  let keyPath: string | null = null;
  let replace = false;
  const ids: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--key') keyPath = args[++i] ?? null;
    else if (a === '--replace') replace = true;
    else ids.push(a);
  }

  if (ids.length === 0) {
    console.error('Usage: npx ts-node scripts/set-super-admins.ts [--key ./serviceAccount.json] [--replace] <UID1> <UID2> ...');
    process.exit(1);
  }
  return { keyPath, replace, ids };
}

const { keyPath, replace, ids } = parseArgs();

initializeApp({
  credential: keyPath
    ? cert(JSON.parse(fs.readFileSync(keyPath, 'utf8')))
    : applicationDefault(),
});

async function main() {
  const db = getFirestore();
  const ref = db.doc('config/app');
  const snap = await ref.get();

  let next: string[];
  if (replace || !snap.exists) {
    next = Array.from(new Set(ids));
  } else {
    const cur = Array.isArray(snap.data()?.superAdminIds)
      ? (snap.data()!.superAdminIds as string[])
      : [];
    next = Array.from(new Set([...cur, ...ids]));
  }

  await ref.set({ superAdminIds: next }, { merge: true });
  console.log('✅ config/app.superAdminIds =', next);
}

main().catch((e) => {
  console.error('Failed:', e);
  process.exit(1);
});