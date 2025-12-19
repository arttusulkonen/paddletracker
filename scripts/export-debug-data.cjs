'use strict';

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Настройка путей. Предполагаем, что serviceAccountKey.json лежит в корне проекта
// Если скрипт лежит в папке scripts/, то выходим на уровень выше (../)
const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');

// Если ключа нет, попробуем поискать в текущей папке (на случай запуска из корня)
const finalKeyPath = fs.existsSync(serviceAccountPath) 
  ? serviceAccountPath 
  : path.join(__dirname, 'serviceAccountKey.json');

if (!fs.existsSync(finalKeyPath)) {
  console.error('❌ Ошибка: serviceAccountKey.json не найден по пути:', finalKeyPath);
  process.exit(1);
}

const serviceAccount = require(finalKeyPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// --- Утилиты для парсинга дат (из твоего кода) ---

function parseFinnish(str) {
  if (!str || typeof str !== 'string') return null;
  try {
    const [d, t] = str.split(' ');
    const [dd, mm, yyyy] = (d || '').split('.').map(Number);
    const [HH, MM, SS] = (t || '00.00.00').split('.').map(Number);
    if (!yyyy || !mm || !dd) return null;
    return new Date(yyyy, (mm || 1) - 1, dd || 1, HH || 0, MM || 0, SS || 0);
  } catch {
    return null;
  }
}

function parseAnyDate(x) {
  if (x == null) return null;
  // Если это Firestore Timestamp
  if (x && typeof x.toDate === 'function') {
    return x.toDate();
  }
  if (typeof x === 'number') {
    const ms = x > 1e12 ? x : x * 1000;
    const d = new Date(ms);
    return isNaN(+d) ? null : d;
  }
  if (typeof x === 'string') {
    const d1 = new Date(x);
    if (!isNaN(+d1)) return d1;
    const d2 = parseFinnish(x);
    if (d2) return d2;
  }
  return null;
}

// Пытаемся найти любое поле, похожее на дату создания
function getDocDate(docData) {
  const fieldsToCheck = ['createdAt', 'timestamp', 'tsIso', 'date', 'roomCreated', 'joinedAt'];
  
  for (const field of fieldsToCheck) {
    const parsed = parseAnyDate(docData[field]);
    if (parsed) return parsed;
  }
  return new Date(0); // Если даты нет, считаем очень старым
}

// --- Логика анализа структуры ---

// Функция очистки данных Firestore для JSON (превращает Timestamp и Ref в строки)
function cleanData(data) {
  if (data === null || data === undefined) return data;
  
  if (data instanceof admin.firestore.Timestamp) {
    return data.toDate().toISOString(); // Сохраняем как ISO строку
  }
  if (data instanceof admin.firestore.DocumentReference) {
    return `REF:${data.path}`;
  }
  if (data instanceof admin.firestore.GeoPoint) {
    return `GEO:${data.latitude},${data.longitude}`;
  }
  
  if (Array.isArray(data)) {
    return data.map(cleanData);
  }
  
  if (typeof data === 'object') {
    const out = {};
    Object.keys(data).forEach(k => {
      out[k] = cleanData(data[k]);
    });
    return out;
  }
  
  return data;
}

// Получаем "сигнатуру" ключей объекта (сортированный список ключей верхнего уровня)
// Это поможет понять, отличается ли структура
function getStructureSignature(obj) {
  if (!obj || typeof obj !== 'object') return '';
  return Object.keys(obj).sort().join('|');
}

async function exportCollection(collectionName) {
  console.log(`📦 Сканируем коллекцию: ${collectionName}...`);
  
  const snap = await db.collection(collectionName).get();
  
  if (snap.empty) {
    console.log(`   └─ Пусто.`);
    return;
  }

  const docs = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
  
  // 1. Находим самый свежий документ (LATEST)
  const docsWithDate = docs.map(d => ({ doc: d, date: getDocDate(d) }));
  docsWithDate.sort((a, b) => b.date - a.date); // Сортировка: новые в начале
  
  const latestDoc = docsWithDate[0].doc;
  const latestDate = docsWithDate[0].date;

  // 2. Ищем все варианты структур (VARIATIONS)
  // Мы будем складывать сюда документы, у которых набор ключей отличается
  const variations = [];
  const seenSignatures = new Set();

  // Проходим по всем документам (начиная с новых)
  for (const { doc } of docsWithDate) {
    const signature = getStructureSignature(doc);
    
    if (!seenSignatures.has(signature)) {
      seenSignatures.add(signature);
      variations.push({
        _note: `Structure Variant (Keys: ${signature})`,
        ...cleanData(doc)
      });
    }
  }

  // Подготавливаем итоговый файл
  const outputData = {
    meta: {
      collection: collectionName,
      totalDocs: docs.length,
      exportedAt: new Date().toISOString(),
      variationsCount: variations.length
    },
    latest: {
      _note: `LATEST DOCUMENT (Date: ${latestDate.toISOString()})`,
      ...cleanData(latestDoc)
    },
    allStructureVariations: variations
  };

  // Сохраняем
  const outPath = path.join(__dirname, '../output', `${collectionName}.json`);
  fs.writeFileSync(outPath, JSON.stringify(outputData, null, 2));
  console.log(`   ✅ Сохранено: ${collectionName}.json (Вариаций схем: ${variations.length})`);
}

async function main() {
  const outputDir = path.join(__dirname, '../output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  try {
    const collections = await db.listCollections();
    console.log(`Найдено коллекций: ${collections.length}\n`);

    for (const col of collections) {
      await exportCollection(col.id);
    }

    console.log('\n🎉 Все данные успешно экспортированы в папку /output');
    process.exit(0);
  } catch (e) {
    console.error('❌ Ошибка:', e);
    process.exit(1);
  }
}

main();