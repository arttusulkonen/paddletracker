// clone-prod-to-dev.cjs
'use strict';

const admin = require('firebase-admin');
const path = require('path');

// === КОНФИГУРАЦИЯ ===
// Пути к ключам. Убедись, что файлы лежат в корне рядом со скриптом.
const PROD_KEY_PATH = path.join(__dirname, 'serviceAccountKey.json');
const DEV_KEY_PATH = path.join(__dirname, 'serviceAccountKeyDev.json');

const BATCH_LIMIT = 450; // Лимит операций в одном батче Firestore (макс 500)

// === ИНИЦИАЛИЗАЦИЯ ===

// 1. Подключаемся к PROD (Source)
const prodServiceAccount = require(PROD_KEY_PATH);
const prodApp = admin.initializeApp(
  {
    credential: admin.credential.cert(prodServiceAccount),
  },
  'prodApp'
); // Имя приложения важно, чтобы не было конфликта
const dbProd = prodApp.firestore();

// 2. Подключаемся к DEV (Destination)
const devServiceAccount = require(DEV_KEY_PATH);
const devApp = admin.initializeApp(
  {
    credential: admin.credential.cert(devServiceAccount),
  },
  'devApp'
);
const dbDev = devApp.firestore();

// === УТИЛИТЫ ===

class BatchWriter {
  constructor(db) {
    this.db = db;
    this.batch = db.batch();
    this.count = 0;
    this.totalCopied = 0;
  }

  async set(ref, data) {
    this.batch.set(ref, data);
    this.count++;
    if (this.count >= BATCH_LIMIT) {
      await this.flush();
    }
  }

  async flush() {
    if (this.count > 0) {
      await this.batch.commit();
      this.totalCopied += this.count;
      console.log(
        `   ...сохранено ${this.count} записей (Всего: ${this.totalCopied})`
      );
      this.batch = this.db.batch();
      this.count = 0;
    }
  }
}

// === ЛОГИКА КОПИРОВАНИЯ ===

async function copyCollection(collectionName) {
  console.log(`\n📦 Копирование коллекции: [${collectionName}]`);

  // 1. Читаем все документы из PROD
  const snapshot = await dbProd.collection(collectionName).get();

  if (snapshot.empty) {
    console.log(`   ⚠️ Коллекция пуста в PROD, пропускаем.`);
    return;
  }

  console.log(`   Найдено документов: ${snapshot.size}`);

  // 2. Пишем в DEV
  const writer = new BatchWriter(dbDev);

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const ref = dbDev.collection(collectionName).doc(doc.id);
    await writer.set(ref, data);
  }

  await writer.flush();
  console.log(`   ✅ Готово: ${collectionName}`);
}

async function main() {
  console.log('🚀 Начинаем клонирование PROD -> DEV...\n');
  console.log(`Prod Project ID: ${prodServiceAccount.project_id}`);
  console.log(`Dev Project ID:  ${devServiceAccount.project_id}\n`);

  try {
    // 1. Получаем список всех коллекций в PROD
    const collections = await dbProd.listCollections();
    const collectionNames = collections.map((c) => c.id);

    console.log('Обнаружены коллекции:', collectionNames.join(', '));

    // 2. Копируем каждую коллекцию
    for (const name of collectionNames) {
      await copyCollection(name);
    }

    console.log('\n🎉 Клонирование успешно завершено!');
  } catch (error) {
    console.error('\n❌ Ошибка при клонировании:', error);
  } finally {
    process.exit();
  }
}

main();
