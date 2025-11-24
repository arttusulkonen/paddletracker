const { Storage } = require('@google-cloud/storage');
const path = require('path');

// Убедитесь, что путь к вашему ключу правильный
// Если скрипт в папке scripts/, то выход на уровень выше: ../serviceAccountKey.json
const keyFilename = path.join(__dirname, '../serviceAccountKey.json');

// Имя вашего бакета (без gs://)
const bucketName = 'tabletennis-f4c23.firebasestorage.app';

const storage = new Storage({ keyFilename });

async function setCors() {
  const bucket = storage.bucket(bucketName);

  const corsConfiguration = [
    {
      origin: [
        'http://localhost:3000',
        'https://tabletennis-f4c23.web.app',
        'https://smashlog.fi',
        'https://www.smashlog.fi',
      ],
      method: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      responseHeader: ['Content-Type', 'Authorization'],
      maxAgeSeconds: 3600,
    },
  ];

  await bucket.setCorsConfiguration(corsConfiguration);

  console.log(`✅ CORS configuration successfully set for ${bucketName}`);

  // Проверка (получим текущие настройки)
  const [metadata] = await bucket.getMetadata();
  console.log('Current CORS:', JSON.stringify(metadata.cors, null, 2));
}

setCors().catch(console.error);
