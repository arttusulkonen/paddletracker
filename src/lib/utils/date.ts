// src/lib/utils/date.ts
import { format } from "date-fns";
import { Timestamp } from "firebase/firestore";

/** Robust date parser for many legacy formats */
export function parseFlexDate(d: string | Timestamp): Date {
  /* Fire­store Timestamp ------------------------------- */
  if (typeof d === "object" && d !== null && "toDate" in d) {
    return d.toDate(); // already a JS Date
  }

  if (typeof d !== "string") return new Date(NaN);

  /* ISO-8601 (e.g. 2025-06-03T14:32:08.063Z) ----------- */
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(d)) {
    const iso = Date.parse(d);
    if (!isNaN(iso)) return new Date(iso);
  }

  /* Normalise legacy Finnish “klo”, commas, double spaces */
  let str = d.replace("klo", "")
    .replace(",", "")
    .replace(/\s+/g, " ")
    .trim();

  /* dd.MM.yyyy HH.mm.ss -------------------------------- */
  let m = str.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4}) (\d{1,2})\.(\d{1,2})\.(\d{1,2})$/
  );
  if (m) {
    const [, day, mon, yr, h, mi, s] = m;
    return new Date(
      `${yr}-${mon.padStart(2, "0")}-${day.padStart(2, "0")}T` +
      `${h.padStart(2, "0")}:${mi.padStart(2, "0")}:${s.padStart(2, "0")}`
    );
  }

  /* dd.MM.yyyy HH.mm ----------------------------------- */
  m = str.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4}) (\d{1,2})\.(\d{1,2})$/
  );
  if (m) {
    const [, day, mon, yr, h, mi] = m;
    return new Date(
      `${yr}-${mon.padStart(2, "0")}-${day.padStart(2, "0")}T` +
      `${h.padStart(2, "0")}:${mi.padStart(2, "0")}:00`
    );
  }

  /* Fallback to built-in parser ------------------------ */
  return new Date(str);
}

/** Safe formatter — returns fallback on error */
export function safeFormatDate(
  dateLike: string | Timestamp,
  fmt: string,
  fallback = "Invalid date"
) {
  const date = parseFlexDate(dateLike);
  if (!(date instanceof Date) || isNaN(date.getTime())) return fallback;

  try {
    return format(date, fmt);
  } catch {
    return fallback;
  }
}