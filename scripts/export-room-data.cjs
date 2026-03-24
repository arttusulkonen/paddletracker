'use strict';

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// --- ЧТЕНИЕ ПАРАМЕТРОВ CLI ---
const args = process.argv.slice(2);
const argMap = {};

args.forEach((arg) => {
  const [key, value] = arg.split('=');
  if (key && value && key.startsWith('--')) {
    argMap[key.slice(2)] = value;
  }
});

const TARGET_ROOM_ID = '2gBBRla2jyTeJU3wVtwD';
const SPORT = argMap.sport || process.env.SPORT || 'pingpong';
const ROOMS_COLLECTION =
  argMap.roomsCollection || process.env.ROOMS_COLLECTION || `rooms-${SPORT}`;
const MATCHES_COLLECTION =
  argMap.matchesCollection ||
  process.env.MATCHES_COLLECTION ||
  `matches-${SPORT}`;

if (!TARGET_ROOM_ID) {
  console.error('❌ Ошибка: не задан roomId.');
  console.error(
    'Использование: node scripts/export-room-data.cjs --roomId=YOUR_ID --sport=pingpong',
  );
  process.exit(1);
}

// Настройка путей для ключа
const serviceAccountPath = path.join(__dirname, '../serviceAccountKeyDev.json');
const finalKeyPath = fs.existsSync(serviceAccountPath)
  ? serviceAccountPath
  : path.join(__dirname, 'serviceAccountKeyDev.json');

if (!fs.existsSync(finalKeyPath)) {
  console.error(
    '❌ Ошибка: serviceAccountKey.json не найден по пути:',
    finalKeyPath,
  );
  process.exit(1);
}

const serviceAccount = require(finalKeyPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// Утилита для очистки данных и скрытия PII (Personal Identifiable Information)
function cleanData(data) {
  if (data === null || data === undefined) return data;
  if (data instanceof admin.firestore.Timestamp)
    return data.toDate().toISOString();
  if (Array.isArray(data)) return data.map(cleanData);
  if (typeof data === 'object') {
    const out = {};
    Object.keys(data).forEach((k) => {
      // Анонимизация чувствительных данных
      if (k === 'email') {
        out[k] = '***@***.***';
      } else if (k === 'avatarURL') {
        out[k] = '[REDACTED_URL]';
      } else {
        out[k] = cleanData(data[k]);
      }
    });
    return out;
  }
  return data;
}

async function exportSpecificRoom() {
  console.log(
    `🔍 Ищем комнату: ${TARGET_ROOM_ID} в коллекции ${ROOMS_COLLECTION}...`,
  );

  try {
    const roomRef = db.collection(ROOMS_COLLECTION).doc(TARGET_ROOM_ID);
    const roomSnap = await roomRef.get();

    let roomData = null;
    if (roomSnap.exists) {
      roomData = cleanData(roomSnap.data());
      console.log(`✅ Комната найдена: ${roomData.name || 'Без названия'}`);
    } else {
      console.warn(
        `⚠️ Документ комнаты не найден, но мы все равно соберем матчи.`,
      );
    }

    console.log(`📦 Собираем матчи из коллекции ${MATCHES_COLLECTION}...`);
    const matchesQuery = await db
      .collection(MATCHES_COLLECTION)
      .where('roomId', '==', TARGET_ROOM_ID)
      .get();

    if (matchesQuery.empty) {
      console.log('🤷‍♂️ В этой комнате пока нет сыгранных матчей.');
      process.exit(0);
    }

    let matches = [];
    matchesQuery.forEach((doc) => {
      matches.push({ id: doc.id, ...cleanData(doc.data()) });
    });

    matches.sort((a, b) => {
      const dateA = new Date(a.tsIso || 0).getTime();
      const dateB = new Date(b.tsIso || 0).getTime();
      return dateA - dateB;
    });

    console.log(`🏓 Найдено матчей: ${matches.length}`);

    const initialPlayersState = {};

    for (const match of matches) {
      if (match.player1Id && !initialPlayersState[match.player1Id]) {
        initialPlayersState[match.player1Id] = {
          id: match.player1Id,
          name: match.player1?.name || 'Unknown',
          initialGlobalElo: match.player1?.oldRating || 1000,
          initialRoomElo: match.player1?.roomOldRating || 1000,
        };
      }
      if (match.player2Id && !initialPlayersState[match.player2Id]) {
        initialPlayersState[match.player2Id] = {
          id: match.player2Id,
          name: match.player2?.name || 'Unknown',
          initialGlobalElo: match.player2?.oldRating || 1000,
          initialRoomElo: match.player2?.roomOldRating || 1000,
        };
      }
    }

    const finalOutput = {
      meta: {
        roomId: TARGET_ROOM_ID,
        exportedAt: new Date().toISOString(),
        totalMatches: matches.length,
        totalPlayers: Object.keys(initialPlayersState).length,
      },
      roomData: roomData,
      initialPlayersState: initialPlayersState,
      matches: matches,
    };

    const outputDir = path.join(__dirname, '../output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    const outPath = path.join(outputDir, `room_${TARGET_ROOM_ID}.json`);
    fs.writeFileSync(outPath, JSON.stringify(finalOutput, null, 2));

    console.log(`\n🎉 Готово! Данные (без PII) успешно экспортированы в:`);
    console.log(`📄 ${outPath}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Произошла ошибка во время выгрузки:', error);
    process.exit(1);
  }
}

exportSpecificRoom();
