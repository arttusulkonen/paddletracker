'use strict';

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// 1. Подключение к Firebase
// Убедитесь, что путь к ключу правильный относительно папки scripts
const serviceAccountPath = path.join(__dirname, '../serviceAccountKeyDev.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error(
    '❌ Ошибка: Не найден файл serviceAccountKey.json в корне проекта!'
  );
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// 2. Конфигурация
const TARGET_UID = '0n6fI9F7CIXTUyHZAlpPI05XlKl2'; // Ваш ID
const OUTPUT_DIR = path.join(__dirname, '../debug_output');

// Создаем папку для выгрузки
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR);
}

async function run() {
  try {
    console.log('🚀 Начинаем выгрузку данных для отладки...');

    // --- ШАГ 1: Выгрузка USER ---
    console.log(`\n1️⃣ Скачиваем профиль пользователя: ${TARGET_UID}`);
    const userDoc = await db.collection('users').doc(TARGET_UID).get();

    if (!userDoc.exists) {
      console.warn('⚠️ Пользователь не найден!');
    } else {
      const userData = userDoc.data();
      const userPath = path.join(OUTPUT_DIR, `user_${TARGET_UID}.json`);
      fs.writeFileSync(userPath, JSON.stringify(userData, null, 2));
      console.log(`✅ Профиль сохранен в: ${userPath}`);
    }

    // --- ШАГ 2: Выгрузка МАТЧЕЙ (pingpong) ---
    console.log(`\n2️⃣ Скачиваем ВСЕ матчи pingpong...`);
    // Мы качаем все, чтобы проверить сортировку и старые форматы дат
    const matchesSnap = await db.collection('matches-pingpong').get();

    console.log(`   Найдено документов: ${matchesSnap.size}`);

    const allMatches = [];
    matchesSnap.forEach((doc) => {
      // Сохраняем ID документа внутрь объекта, это важно для поиска битых данных
      allMatches.push({
        _docId: doc.id,
        ...doc.data(),
      });
    });

    // Сохраняем как есть, без сортировки скриптом (чтобы видеть как отдает база)
    const matchesPath = path.join(OUTPUT_DIR, 'matches-pingpong-FULL.json');
    fs.writeFileSync(matchesPath, JSON.stringify(allMatches, null, 2));
    console.log(`✅ Все матчи сохранены в: ${matchesPath}`);

    // --- ШАГ 3: Фильтрация (опционально, чисто для удобства просмотра) ---
    console.log(`\n3️⃣ Создаем отфильтрованный файл только с вашими матчами...`);
    const myMatches = allMatches.filter((m) => {
      // Проверяем массивы players, player1Id, player2Id
      const p1 = m.player1Id === TARGET_UID;
      const p2 = m.player2Id === TARGET_UID;
      const inList =
        m.players && Array.isArray(m.players) && m.players.includes(TARGET_UID);
      return p1 || p2 || inList;
    });

    const myMatchesPath = path.join(OUTPUT_DIR, `matches-pingpong-MY.json`);
    fs.writeFileSync(myMatchesPath, JSON.stringify(myMatches, null, 2));
    console.log(
      `✅ Ваши матчи (${myMatches.length} шт.) сохранены в: ${myMatchesPath}`
    );

    // --- ШАГ 4: Выгрузка tournament-rooms ---
    console.log(`\n4️⃣ Скачиваем все tournament-rooms...`);
    const tournamentRoomsSnap = await db.collection('tournament-rooms').get();
    console.log(`   Найдено документов: ${tournamentRoomsSnap.size}`);

    const tournamentRooms = [];
    tournamentRoomsSnap.forEach((doc) => {
      tournamentRooms.push({
        _docId: doc.id,
        ...doc.data(),
      });
    });

    const tournamentRoomsPath = path.join(OUTPUT_DIR, 'tournament-rooms.json');
    fs.writeFileSync(
      tournamentRoomsPath,
      JSON.stringify(tournamentRooms, null, 2)
    );
    console.log(`✅ tournament-rooms сохранены в: ${tournamentRoomsPath}`);

    console.log(
      '\n🎉 Готово! Теперь вы можете отправить мне содержимое файлов:'
    );
    console.log(`1. ${path.basename(myMatchesPath)}`);
    console.log(
      `2. ${path.basename(matchesPath)} (если он не слишком огромный)`
    );
    console.log(`3. user_${TARGET_UID}.json`);
    console.log(`4. ${path.basename(tournamentRoomsPath)}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Произошла ошибка:', error);
    process.exit(1);
  }
}

run();
