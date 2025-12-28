// src/lib/moderation.ts
import filter from 'leo-profanity';

// Импортируем словари языков из naughty-words
// en - английский, ru - русский, fi - финский, ko - корейский
import { en, fi, ko, ru } from 'naughty-words';
// Дополнительные популярные языки для защиты от "гостей"
import { de, es, fr, ja, zh } from 'naughty-words';

// 1. Создаем объединенный массив плохих слов
// Мы объединяем все массивы в один плоский список.
// filter.add() принимает массив строк.
const GLOBAL_BAD_WORDS = [
  ...en, 
  ...ru, 
  ...fi, 
  ...ko,
  ...es, // Испанский
  ...fr, // Французский
  ...de, // Немецкий
  ...ja, // Японский
  ...zh, // Китайский
  'порнхаб', 'xvideos', 'brazzers', 'xnxx', 'redtube', 'pornhub', 
];

// 2. Сбрасываем дефолтный словарь и загружаем наш ГЛОБАЛЬНЫЙ
// Это заставляет библиотеку проверять текст сразу по всем этим языкам.
filter.clearList();
filter.add(GLOBAL_BAD_WORDS);

/**
 * Проверяет текст на наличие нецензурной лексики на множестве языков.
 * Возвращает true, если найден мат.
 */
export function containsProfanity(text: string | null | undefined): boolean {
  if (!text || text.trim() === '') return false;
  
  // Метод check() теперь ищет совпадения из нашего огромного объединенного списка
  // Он также пытается найти "замаскированный" мат (l33t speak) для латиницы.
  return filter.check(text);
}

/**
 * Валидация файла изображения (размер и тип)
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  // Проверка размера (2MB)
  if (file.size > 2 * 1024 * 1024) {
    return { valid: false, error: 'File too large (max 2MB)' };
  }
  
  // Проверка типа
  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    return { valid: false, error: 'Invalid file type (JPG/PNG/WEBP only)' };
  }
  
  return { valid: true };
}