// scripts/backfill-adminIds.ts
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';

type Args = {
  keyPath?: string | null;
  dryRun: boolean;
  sports: string[];
  extraAdmins: string[];
};

function parseArgs(): Args {
  const args = process.argv.slice(2);
  let keyPath: string | null = null;
  let dryRun = false;
  let sports: string[] = ['pingpong', 'tennis', 'badminton'];
  const extraAdmins: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--key') {
      keyPath = args[++i] ?? null;
    } else if (a === '--dry-run') {
      dryRun = true;
    } else if (a === '--sports') {
      const v = (args[++i] ?? '').trim();
      if (v) sports = v.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a === '--with-super') {
      const v = (args[++i] ?? '').trim();
      if (v) {
        v.split(',').map((s) => s.trim()).filter(Boolean).forEach((uid) => {
          if (!extraAdmins.includes(uid)) extraAdmins.push(uid);
        });
      }
    }
  }

  return { keyPath, dryRun, sports, extraAdmins };
}

const { keyPath, dryRun, sports, extraAdmins } = parseArgs();

initializeApp({
  credential: keyPath
    ? cert(JSON.parse(fs.readFileSync(keyPath, 'utf8')))
    : applicationDefault(),
});

const db = getFirestore();

function uniqStrings(arr: unknown[]): string[] {
  const out: string[] = [];
  for (const v of arr) {
    if (typeof v === 'string' && v.trim()) {
      const s = v.trim();
      if (!out.includes(s)) out.push(s);
    }
  }
  return out;
}

async function backfillOneCollection(coll: string) {
  const snap = await db.collection(coll).get();
  let updated = 0;
  let skipped = 0;

  for (const doc of snap.docs) {
    const data = doc.data() || {};

    const currentAdmins = Array.isArray(data.adminIds)
      ? uniqStrings(data.adminIds)
      : [];

    const creator = typeof data.creator === 'string' ? data.creator : null;

    const memberAdmins: string[] = [];
    if (Array.isArray(data.members)) {
      for (const m of data.members) {
        if (m && m.role === 'admin' && typeof m.userId === 'string') {
          memberAdmins.push(m.userId);
        }
      }
    }

    const nextAdmins = uniqStrings([
      ...currentAdmins,
      ...(creator ? [creator] : []),
      ...memberAdmins,
      ...extraAdmins,
    ]);

    if (
      nextAdmins.length === currentAdmins.length &&
      nextAdmins.every((x) => currentAdmins.includes(x))
    ) {
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(
        `DRY-RUN ${coll}/${doc.id}: adminIds ${JSON.stringify(
          currentAdmins
        )} -> ${JSON.stringify(nextAdmins)}`
      );
    } else {
      await doc.ref.update({ adminIds: nextAdmins });
    }
    updated++;
  }

  console.log(
    `${dryRun ? '🧪 DRY' : '✅'} ${coll}: updated ${updated}, skipped ${skipped}, total ${snap.size}`
  );
}

async function main() {
  for (const sport of sports) {
    const coll = `rooms-${sport}`;
    await backfillOneCollection(coll);
  }
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});