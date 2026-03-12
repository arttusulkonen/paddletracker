// src/types/naughty-words.d.ts

declare module 'naughty-words' {
  // Твои основные языки
  export const en: string[];
  export const ru: string[];
  export const fi: string[];
  export const ko: string[];

  // Дополнительные языки, которые мы добавили
  export const es: string[];
  export const fr: string[];
  export const de: string[];
  export const ja: string[];
  export const zh: string[];
  export const it: string[];
  export const pt: string[];
  
  // Если понадобятся другие, просто добавляй сюда: export const код: string[];
}