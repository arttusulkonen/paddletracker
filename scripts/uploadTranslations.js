const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const languages = ['en', 'ru', 'fi', 'ko'];

async function uploadTranslations() {
  console.log('Starting translation upload...');

  for (const lang of languages) {
    try {
      const filePath = path.join(
        __dirname,
        '..',
        'public',
        'locales',
        lang,
        'translation.json'
      );

      const fileContent = fs.readFileSync(filePath, 'utf8');
      const translations = JSON.parse(fileContent);
      const docRef = db.collection('translations').doc(lang);
      await docRef.set(translations);

      console.log(
        `✅ Successfully uploaded translations for: ${lang.toUpperCase()}`
      );
    } catch (error) {
      console.error(
        `❌ Failed to upload translations for: ${lang.toUpperCase()}`,
        error
      );
    }
  }
}

uploadTranslations();
