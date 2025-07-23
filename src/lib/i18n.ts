// src/lib/i18n.ts
import { doc, getDoc } from 'firebase/firestore';
import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { db } from './firebase';

// Базовые переводы из локальных файлов (как запасной вариант)
import translationEN from '../../public/locales/en/translation.json';
import translationFI from '../../public/locales/fi/translation.json';
import translationKO from '../../public/locales/ko/translation.json';
import translationRU from '../../public/locales/ru/translation.json';

const staticResources = {
  en: { translation: translationEN },
  ru: { translation: translationRU },
  fi: { translation: translationFI },
  ko: { translation: translationKO },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: staticResources, // Загружаем базовые переводы
    supportedLngs: ['en', 'ru', 'fi', 'ko'],
    fallbackLng: 'en',
    debug: process.env.NODE_ENV === 'development',
    interpolation: { escapeValue: false },
    detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'] },
  });

// Эта функция будет подгружать свежие переводы из Firestore
export const fetchAndMergeTranslations = async (lang: string) => {
  try {
    const docRef = doc(db, 'translations', lang);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const remoteData = docSnap.data();
      // Добавляем/перезаписываем переводы свежими данными из БД
      i18n.addResourceBundle(lang, 'translation', remoteData, true, true);
      // Принудительно обновляем язык, чтобы React перерисовался
      await i18n.changeLanguage(lang);
    }
  } catch (error) {
    console.error("Failed to fetch remote translations:", error);
  }
};

export default i18n;