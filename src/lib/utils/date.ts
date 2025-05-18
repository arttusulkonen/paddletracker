// src/lib/utils/date.ts
import { format } from "date-fns";
import { Timestamp } from "firebase/firestore";

// Парсит строку формата "17.05.2025 13.51.30" или "17.5.2025 klo 14.55.31"
export function parseFlexDate(d: string | Timestamp): Date {
  if (typeof d === "object" && d !== null && "toDate" in d) {
    // Firestore Timestamp
    return d.toDate();
  }
  if (typeof d !== "string") return new Date(NaN);

  // Унификация: убираем "klo", запятые и двойные пробелы
  let str = d.replace("klo", "").replace(",", "").replace(/\s+/g, " ").trim();

  // match "dd.MM.yyyy HH.mm.ss"
  let m = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4}) (\d{1,2})\.(\d{1,2})\.(\d{1,2})$/);
  if (m) {
    // Преобразуем в ISO-строку: yyyy-MM-ddTHH:mm:ss
    const [_, day, month, year, hour, min, sec] = m;
    return new Date(
      `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${min.padStart(2, "0")}:${sec.padStart(2, "0")}`
    );
  }

  // match "dd.MM.yyyy HH.mm"
  m = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4}) (\d{1,2})\.(\d{1,2})$/);
  if (m) {
    const [_, day, month, year, hour, min] = m;
    return new Date(
      `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${min.padStart(2, "0")}:00`
    );
  }

  // Если не распознали — пробуем стандартный парсер
  return new Date(str);
}

// Возвращает строку или fallback
export function safeFormatDate(dateLike: string | Timestamp, formatStr: string, fallback = "Invalid date") {
  const date = parseFlexDate(dateLike);
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn("Invalid date value:", dateLike, new Error().stack);
    }
    return fallback;
  }
  try {
    return format(date, formatStr);
  } catch {
    return fallback;
  }
}