'use strict';

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// --- НАСТРОЙКИ ---
const TARGET_ROOM_ID = 'J3VUInrJ8rLpgRAbEwIo';
const ROOMS_COLLECTION = 'rooms-pingpong';
const MATCHES_COLLECTION = 'matches-pingpong';

// Настройка путей для ключа
const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');
const finalKeyPath = fs.existsSync(serviceAccountPath) 
  ? serviceAccountPath 
  : path.join(__dirname, 'serviceAccountKey.json');

if (!fs.existsSync(finalKeyPath)) {
  console.error('❌ Ошибка: serviceAccountKey.json не найден по пути:', finalKeyPath);
  process.exit(1);
}

const serviceAccount = require(finalKeyPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// Утилита для очистки данных (превращаем Timestamp в строки)
function cleanData(data) {
  if (data === null || data === undefined) return data;
  if (data instanceof admin.firestore.Timestamp) return data.toDate().toISOString();
  if (Array.isArray(data)) return data.map(cleanData);
  if (typeof data === 'object') {
    const out = {};
    Object.keys(data).forEach(k => { out[k] = cleanData(data[k]); });
    return out;
  }
  return data;
}

async function exportSpecificRoom() {
  console.log(`🔍 Ищем комнату: ${TARGET_ROOM_ID}...`);

  try {
    // 1. Получаем данные самой комнаты
    const roomRef = db.collection(ROOMS_COLLECTION).doc(TARGET_ROOM_ID);
    const roomSnap = await roomRef.get();
    
    let roomData = null;
    if (roomSnap.exists) {
      roomData = cleanData(roomSnap.data());
      console.log(`✅ Комната найдена: ${roomData.name || 'Без названия'}`);
    } else {
      console.warn(`⚠️ Документ комнаты не найден, но мы все равно соберем матчи.`);
    }

    // 2. Получаем все матчи для этой комнаты
    console.log(`📦 Собираем матчи из коллекции ${MATCHES_COLLECTION}...`);
    const matchesQuery = await db.collection(MATCHES_COLLECTION)
      .where('roomId', '==', TARGET_ROOM_ID)
      .get();

    if (matchesQuery.empty) {
      console.log('🤷‍♂️ В этой комнате пока нет сыгранных матчей.');
      process.exit(0);
    }

    // 3. Формируем и сортируем массив матчей (от старых к новым)
    let matches = [];
    matchesQuery.forEach(doc => {
      matches.push({ id: doc.id, ...cleanData(doc.data()) });
    });

    // Сортировка по tsIso (по возрастанию, чтобы найти самые первые матчи)
    matches.sort((a, b) => {
      const dateA = new Date(a.tsIso || 0).getTime();
      const dateB = new Date(b.tsIso || 0).getTime();
      return dateA - dateB;
    });

    console.log(`🏓 Найдено матчей: ${matches.length}`);

    // 4. Вычисляем изначальные ELO игроков
    const initialPlayersState = {};

    // Так как матчи отсортированы от старых к новым, 
    // первый раз, когда мы встречаем игрока, его oldRating — это его рейтинг на начало комнаты.
    for (const match of matches) {
      // Проверяем Игрока 1
      if (match.player1Id && !initialPlayersState[match.player1Id]) {
        initialPlayersState[match.player1Id] = {
          id: match.player1Id,
          name: match.player1?.name || 'Unknown',
          initialGlobalElo: match.player1?.oldRating || 1000,
          initialRoomElo: match.player1?.roomOldRating || 1000
        };
      }
      
      // Проверяем Игрока 2
      if (match.player2Id && !initialPlayersState[match.player2Id]) {
        initialPlayersState[match.player2Id] = {
          id: match.player2Id,
          name: match.player2?.name || 'Unknown',
          initialGlobalElo: match.player2?.oldRating || 1000,
          initialRoomElo: match.player2?.roomOldRating || 1000
        };
      }
    }

    // 5. Формируем финальный JSON
    const finalOutput = {
      meta: {
        roomId: TARGET_ROOM_ID,
        exportedAt: new Date().toISOString(),
        totalMatches: matches.length,
        totalPlayers: Object.keys(initialPlayersState).length
      },
      roomData: roomData,
      initialPlayersState: initialPlayersState,
      matches: matches
    };

    // 6. Сохраняем в папку output
    const outputDir = path.join(__dirname, '../output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    const outPath = path.join(outputDir, `room_${TARGET_ROOM_ID}.json`);
    fs.writeFileSync(outPath, JSON.stringify(finalOutput, null, 2));

    console.log(`\n🎉 Готово! Данные успешно экспортированы в:`);
    console.log(`📄 ${outPath}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Произошла ошибка во время выгрузки:', error);
    process.exit(1);
  }
}

exportSpecificRoom();