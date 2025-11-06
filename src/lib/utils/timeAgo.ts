// src/lib/utils/timeAgo.ts
import i18n from '@/lib/i18n'; // <--- НАЧАЛО ИСПРАВЛЕНИЯ: Прямой импорт i18n
import { TFunction } from 'i18next';
import { parseFlexDate } from './date'; // Убедитесь, что parseFlexDate импортируется из вашего utils/date

/**
 * Форматирует дату в строку "time ago".
 * @param dateInput Дата (ISO строка, Timestamp или Date объект)
 * @param t Функция перевода i18next
 * @returns Строка типа "5м назад" или "3ч назад"
 */
export const formatTimeAgo = (
  dateInput: string | number | Date | { seconds: number; nanoseconds: number },
  t: TFunction
): string => {
  if (!dateInput) return '';

  try {
    const date = parseFlexDate(dateInput);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (isNaN(seconds) || seconds < 0) {
      return t('in the future');
    }
    if (seconds < 60) {
      return t('just now');
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return t('{{count}}m ago', { count: minutes });
    }

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return t('{{count}}h ago', { count: hours });
    }

    const days = Math.floor(hours / 24);
    if (days < 7) {
      return t('{{count}}d ago', { count: days });
    }

    const weeks = Math.floor(days / 7);
    if (weeks < 5) {
      // ~ 1 month
      return t('{{count}}w ago', { count: weeks });
    }

    // --- ИСПРАВЛЕНИЕ: Используем i18n.language ---
    // Используем i18n.language вместо t.i18n.language
    return date.toLocaleDateString(i18n.language || 'en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch (error) {
    console.error('Error formatting time ago:', error, dateInput);
    return '';
  }
};
