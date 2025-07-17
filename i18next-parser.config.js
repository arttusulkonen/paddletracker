module.exports = {
  lexers: {
    js: ['JavascriptLexer'],
    jsx: ['JsxLexer'],
    ts: ['JavascriptLexer'],
    tsx: ['JsxLexer'],
    default: ['JavascriptLexer']
  },

  locales: ['en', 'ru', 'fi', 'ko'],

  output: 'public/locales/$LOCALE/translation.json',

  input: ['src/**/*.{js,jsx,ts,tsx}'],

  // Добавь это!
  keySeparator: false, // Если используешь plain ключи, без вложенности
  namespaceSeparator: false,

  // 🗝️ Явно укажи функции
  func: {
    list: ['t'], // ищет t('...')
    extensions: ['.js', '.jsx', '.ts', '.tsx']
  },

  defaultValue: (lng, ns, key) => {
    if (lng === 'en') {
      return key;
    }
    return '';
  },

  keepRemoved: true,
  createOldCatalogs: false,
  sort: true,
};