const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Укажите путь к вашему ключу сервисного аккаунта
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const languages = ['en', 'ru', 'fi', 'ko']; // Языки, которые нужно загрузить

async function uploadTranslations() {
  console.log('Starting translation upload...');

  for (const lang of languages) {
    try {
      // Путь к вашему файлу перевода
      const filePath = path.join(__dirname, '..', 'public', 'locales', lang, 'translation.json');

      // Читаем и парсим JSON файл
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const translations = JSON.parse(fileContent);

      // Получаем ссылку на документ в Firestore (ID документа = код языка)
      const docRef = db.collection('translations').doc(lang);

      // Записываем данные в документ
      await docRef.set(translations);

      console.log(`✅ Successfully uploaded translations for: ${lang.toUpperCase()}`);
    } catch (error) {
      console.error(`❌ Failed to upload translations for: ${lang.toUpperCase()}`, error);
    }
  }
  console.log('Finished.');
}

uploadTranslations();