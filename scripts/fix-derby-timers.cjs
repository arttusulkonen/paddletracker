'use strict';

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Чтение аргументов
const args = process.argv.slice(2);
const argMap = {};
args.forEach(arg => {
  const [key, value] = arg.split('=');
  if (key && value && key.startsWith('--')) argMap[key.slice(2)] = value;
});

const SPORT = argMap.sport || 'pingpong';
const ROOMS_COLLECTION = `rooms-${SPORT}`;
const MATCHES_COLLECTION = `matches-${SPORT}`;

const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');
const finalKeyPath = fs.existsSync(serviceAccountPath) 
  ? serviceAccountPath 
  : path.join(__dirname, 'serviceAccountKey.json');

if (!fs.existsSync(finalKeyPath)) {
  console.error('❌ Ошибка: serviceAccountKey.json не найден');
  process.exit(1);
}

const serviceAccount = require(finalKeyPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function fixTimers() {
  console.log(`🔍 Поиск Derby-комнат без sprintStartTs в ${ROOMS_COLLECTION}...`);
  
  try {
    const roomsSnap = await db.collection(ROOMS_COLLECTION)
      .where('mode', '==', 'derby')
      .get();
    
    let fixedCount = 0;

    for (const doc of roomsSnap.docs) {
      const data = doc.data();
      
      // Если таймер не запущен
      if (!data.sprintStartTs) {
        console.log(`⏳ Исправляем комнату: ${data.name} (${doc.id})`);
        
        // Ищем все матчи в этой комнате
        const matchesSnap = await db.collection(MATCHES_COLLECTION)
          .where('roomId', '==', doc.id)
          .get();
        
        let firstMatchTs = null;

        if (!matchesSnap.empty) {
          let oldestMs = Infinity;
          matchesSnap.forEach(mDoc => {
            const mData = mDoc.data();
            if (mData.tsIso) {
              const ms = new Date(mData.tsIso).getTime();
              if (ms < oldestMs) oldestMs = ms;
            }
          });
          if (oldestMs !== Infinity) firstMatchTs = oldestMs;
        }

        // Если нашли матчи — берем дату первого. Если нет — берем текущую дату
        const newStartTs = firstMatchTs || Date.now();
        
        await doc.ref.update({ sprintStartTs: newStartTs });
        console.log(`  ✅ sprintStartTs установлен на: ${new Date(newStartTs).toISOString()}`);
        fixedCount++;
      }
    }
    
    console.log(`\n🎉 Готово! Исправлено комнат: ${fixedCount}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Произошла ошибка:', error);
    process.exit(1);
  }
}

fixTimers();