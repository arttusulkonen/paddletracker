// migrate-auth.cjs
'use strict';

const admin = require('firebase-admin');
const path = require('path');

// === КОНФИГУРАЦИЯ ===
const PROD_KEY_PATH = path.join(__dirname, 'serviceAccountKey.json');
const DEV_KEY_PATH = path.join(__dirname, 'serviceAccountKeyDev.json');

// Пароль, который будет установлен для всех перенесенных пользователей в DEV
const DEFAULT_DEV_PASSWORD = 'password123';

// === ИНИЦИАЛИЗАЦИЯ ===
const prodApp = admin.initializeApp(
  {
    credential: admin.credential.cert(require(PROD_KEY_PATH)),
  },
  'prodAuthApp'
);

const devApp = admin.initializeApp(
  {
    credential: admin.credential.cert(require(DEV_KEY_PATH)),
  },
  'devAuthApp'
);

const dbDev = devApp.firestore();

// === ЛОГИКА ===

async function migrateAuth() {
  console.log('🚀 Начинаем миграцию пользователей Auth (Prod -> Dev)...\n');

  try {
    // 1. Получаем список пользователей из PROD
    // (Лимит 1000, если пользователей больше, нужна пагинация, но для офисной лиги хватит)
    const listUsersResult = await prodApp.auth().listUsers(1000);
    const prodUsers = listUsersResult.users;

    console.log(`Найдено пользователей в PROD: ${prodUsers.length}`);

    if (prodUsers.length === 0) {
      console.log('Нет пользователей для переноса.');
      return;
    }

    // 2. Подготавливаем данные для импорта
    const usersToImport = prodUsers.map((user) => {
      return {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        // Мы не можем получить хэш пароля через Admin SDK listUsers,
        // поэтому ставим дефолтный пароль для Dev среды.
        password: DEFAULT_DEV_PASSWORD,
      };
    });

    // 3. Импортируем в DEV
    // importUsers позволяет создавать пользователей массово с заданными UID
    const importResult = await devApp.auth().importUsers(usersToImport, {
      hash: { algorithm: 'BCRYPT' }, // Это заглушка, т.к. мы передаем plain text password
    });

    console.log(`\n✅ Успешно импортировано: ${importResult.successCount}`);
    if (importResult.failureCount > 0) {
      console.log(`⚠️ Ошибок импорта: ${importResult.failureCount}`);
      console.log('   (Скорее всего, эти пользователи уже существуют в Dev)');
    }

    // 4. Аппрув пользователей в Firestore
    console.log('\n🔄 Обновляем статус approved: true в Firestore...');

    const batch = dbDev.batch();
    let updatesCount = 0;

    for (const user of prodUsers) {
      const userRef = dbDev.collection('users').doc(user.uid);

      // Ставим approved: true, чтобы пропустить экран ожидания
      batch.update(userRef, {
        approved: true,
        // Также можно принудительно выставить роль, если нужно, но лучше оставить как в базе
      });

      updatesCount++;
    }

    if (updatesCount > 0) {
      await batch.commit();
      console.log(`✅ Обновлено документов в Firestore: ${updatesCount}`);
    }
  } catch (error) {
    console.error('❌ Ошибка:', error);
  }
}

migrateAuth().then(() => {
  console.log('\n🎉 Готово! Теперь можно зайти под Prod-админом.');
  console.log(`🔑 Логин: (email админа)`);
  console.log(`🔑 Пароль: ${DEFAULT_DEV_PASSWORD}`);
  process.exit();
});
