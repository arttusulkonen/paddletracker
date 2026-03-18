'use strict';

const admin = require('firebase-admin');
const path = require('path');

// Убедись, что путь к serviceAccountKey правильный
const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function recoverDeletedMatches(roomId, sport, targetIsoTime) {
  console.log(`\n🕰️ Запускаем машину времени... Цель: ${targetIsoTime}`);
  
  const matchesColl = `matches-${sport}`;
  const pastTimestamp = admin.firestore.Timestamp.fromDate(new Date(targetIsoTime));
  let recoveredDocs = [];

  try {
    // 1. Читаем данные из прошлого (Read-Only Transaction с параметром readTime)
    await db.runTransaction(async (t) => {
      const query = db.collection(matchesColl).where('roomId', '==', roomId);
      const snapshot = await t.get(query);
      
      snapshot.forEach(doc => {
        recoveredDocs.push({ id: doc.id, data: doc.data() });
      });
    }, { readOnly: true, readTime: pastTimestamp });

    console.log(`📡 Найдено матчей в прошлом: ${recoveredDocs.length}`);

    if (recoveredDocs.length === 0) {
      console.log('❌ Матчи не найдены. Возможно, время указано неверно (слишком рано или уже после удаления).');
      return;
    }

    // 2. Записываем найденные данные в настоящее время
    console.log('⚡ Возвращаем матчи в настоящее...');
    const batch = db.batch();
    
    recoveredDocs.forEach(match => {
      const docRef = db.collection(matchesColl).doc(match.id);
      batch.set(docRef, match.data);
    });

    await batch.commit();
    console.log(`✅ Успешно восстановлено матчей: ${recoveredDocs.length} для комнаты ${roomId}!`);

  } catch (error) {
    console.error('🚨 Ошибка при восстановлении:', error);
  }
}

// ==========================================
// 🛠 НАСТРОЙКИ ВОССТАНОВЛЕНИЯ
// ==========================================

const ROOM_ID = 'Tr6Tf7oXBr8pGWxuspUD'; 
const SPORT = 'pingpong';

// ВРЕМЯ ДО ТОГО КАК ТЫ НАЖАЛ "FINISH SEASON"
// Формат: ISO 8601. Пример: '2026-03-16T11:00:00Z' (Время по UTC!)
// Если ты удалил их недавно, отмотай на пару часов назад.
const RECOVERY_TIME = '2026-03-16T11:00:00Z'; 

recoverDeletedMatches(ROOM_ID, SPORT, RECOVERY_TIME).then(() => {
  console.log('🏁 Готово!');
  process.exit(0);
});