// backfill-translations.cjs
// Запуск: node backfill-translations.cjs ./serviceAccountKey.json

'use strict';
const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

/* ─── Инициализация ─── */
const keyFile = process.argv[2] || './serviceAccountKey.json';
try {
  admin.initializeApp({
    credential: admin.credential.cert(require(path.resolve(keyFile))),
  });
} catch (error) {
  console.error(
    'Ошибка инициализации Firebase. Убедитесь, что файл serviceAccountKey.json находится в правильном месте и корректен.',
    error
  );
  process.exit(1);
}

const db = admin.firestore();
const localesDir = path.resolve(__dirname, 'public/locales');

/* ─── Основная логика ─── */
(async () => {
  try {
    console.log(`⏳ Поиск файлов перевода в ${localesDir}...`);

    const langDirs = fs
      .readdirSync(localesDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);

    if (langDirs.length === 0) {
      console.log('Не найдено ни одной папки с языком.');
      process.exit(0);
    }

    console.log(`Найдены языки: ${langDirs.join(', ')}`);

    for (const lang of langDirs) {
      const filePath = path.join(localesDir, lang, 'translation.json');

      if (fs.existsSync(filePath)) {
        console.log(`- Обработка ${filePath}...`);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const translations = JSON.parse(fileContent);

        const docRef = db.collection('translations').doc(lang);

        // Используем set с merge: true, чтобы обновить или создать документ
        await docRef.set(translations, { merge: true });
        console.log(`  ✅ Переводы для '${lang}' успешно загружены в Firestore.`);
      } else {
        console.warn(`  ⚠️ Файл перевода для '${lang}' не найден.`);
      }
    }

    console.log('\n✅ Миграция переводов завершена.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Произошла ошибка во время выполнения скрипта:', error);
    process.exit(1);
  }
})();