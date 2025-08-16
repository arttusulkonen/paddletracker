// scripts/grant-admin.ts
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'node:fs';

function parseArgs() {
  const args = process.argv.slice(2);
  let keyPath: string | null = null;
  let revoke = false;
  const uids: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--key') {
      keyPath = args[++i] ?? null;
    } else if (a === '--revoke') {
      revoke = true;
    } else {
      uids.push(a);
    }
  }

  if (uids.length !== 1) {
    console.error('Usage: npx ts-node scripts/grant-admin.ts [--key ./serviceAccount.json] [--revoke] <UID>');
    process.exit(1);
  }
  return { uid: uids[0], keyPath, revoke };
}

const { uid, keyPath, revoke } = parseArgs();

initializeApp({
  credential: keyPath
    ? cert(JSON.parse(fs.readFileSync(keyPath, 'utf8')))
    : applicationDefault(),
});

async function main() {
  const auth = getAuth();
  if (revoke) {
    await auth.setCustomUserClaims(uid, { admin: null });
    console.log(`🧹 Admin claim removed for UID: ${uid}`);
  } else {
    await auth.setCustomUserClaims(uid, { admin: true });
    console.log(`✅ Admin claim set for UID: ${uid}`);
  }
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});