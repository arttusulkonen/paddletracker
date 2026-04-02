// scripts/auto-translate.ts
import { googleAI } from '@genkit-ai/googleai';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { genkit, z } from 'genkit';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Воссоздаем __dirname для ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Явно указываем путь к твоему файлу .env.development
const envPath = path.resolve(__dirname, '../.env.development');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  // Фолбэк, если когда-нибудь появится обычный .env
  dotenv.config();
}

// Если ключ называется иначе, Genkit всё равно ждет GOOGLE_GENAI_API_KEY или GEMINI_API_KEY
// Если в твоем .env он называется просто API_KEY, можешь раскомментировать строку ниже:
// process.env.GOOGLE_GENAI_API_KEY = process.env.ТВОЕ_НАЗВАНИЕ_КЛЮЧА;

// Инициализируем ИИ
const ai = genkit({
  plugins: [googleAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY })],
  model: 'googleai/gemini-2.0-flash',
});

const localesDir = path.resolve(__dirname, '../public/locales');
const targetLocales = ['ru', 'fi', 'ko'];

// Названия языков для промпта ИИ
const localeNames: Record<string, string> = {
  ru: 'Russian',
  fi: 'Finnish',
  ko: 'Korean',
};

async function translateMissing() {
  for (const locale of targetLocales) {
    const filePath = path.join(localesDir, locale, 'translation.json');

    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Файл не найден: ${filePath}`);
      continue;
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const translations = JSON.parse(fileContent);

    // Находим только те ключи, у которых значение пустое ""
    const missingKeys = Object.keys(translations).filter(
      (key) => translations[key] === ''
    );

    if (missingKeys.length === 0) {
      console.log(`✅ Нет пустых строк для перевода в [${locale}]`);
      continue;
    }

    console.log(`⏳ Переводим ${missingKeys.length} новых строк для [${locale}]...`);

    // Обрабатываем батчами по 40 строк, чтобы ИИ не запутался и не обрезал ответ
    const batchSize = 40;
    for (let i = 0; i < missingKeys.length; i += batchSize) {
      const batchKeys = missingKeys.slice(i, i + batchSize);
      const objToTranslate: Record<string, string> = {};

      // Исходным текстом для перевода является сам ключ (т.к. мы пишем ключи на английском)
      batchKeys.forEach((k) => {
        objToTranslate[k] = k;
      });

      try {
        console.log(`   Отправка батча ${Math.floor(i / batchSize) + 1}...`);
        const response = await ai.generate({
          prompt: `Translate the values of the following JSON from English to ${localeNames[locale]}. 
          Context: A web application for racket sports (ping pong, tennis, badminton) that includes ELO tracking, match history, tournaments, and a "Derby" mode with bounties, win streaks, and nemeses.
          Keep the JSON keys exactly the same as in the original, ONLY translate the values into natural, UI-friendly language.
          
          JSON to translate:
          ${JSON.stringify(objToTranslate, null, 2)}`,
          output: {
            schema: z.record(z.string()), // Гарантирует, что на выходе будет чистый объект { "Ключ": "Перевод" }
          },
        });

        const translatedBatch = response.output;

        if (translatedBatch) {
          // Записываем переводы в основной объект
          Object.keys(translatedBatch).forEach((key) => {
            if (translations[key] === '') {
              translations[key] = translatedBatch[key];
            }
          });
        }
      } catch (error) {
        console.error(`❌ Ошибка перевода батча для ${locale}:`, error);
      }
    }

    // Сортируем ключи по алфавиту (как это делает сам i18next-parser)
    const sortedTranslations = Object.keys(translations)
      .sort()
      .reduce((acc: Record<string, string>, key) => {
        acc[key] = translations[key];
        return acc;
      }, {});

    // Сохраняем обновленный файл
    fs.writeFileSync(
      filePath,
      JSON.stringify(sortedTranslations, null, 2) + '\n',
      'utf8'
    );
    console.log(`🎉 Файл [${locale}] успешно обновлен!\n`);
  }
}

translateMissing()
  .then(() => console.log('🚀 Все переводы успешно завершены!'))
  .catch(console.error);