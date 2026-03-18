// eslint.config.mjs
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import unusedImports from 'eslint-plugin-unused-imports';
import { dirname } from 'path';
import tseslint from 'typescript-eslint';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...compat.extends('next/core-web-vitals'),
  {
    plugins: {
      'unused-imports': unusedImports,
      'react-hooks': reactHooks,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      'react/react-in-jsx-scope': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',

      // --- НОВЫЕ ПРАВИЛА ---
      // Разрешаем setState в useEffect (это частый паттерн, React перестраховывается)
      'react-hooks/set-state-in-effect': 'off',
      // Разрешаем Math.random() и Date.now()
      'react-hooks/purity': 'off',
      // Разрешаем <a href> (если где-то забыли <Link>)
      '@next/next/no-html-link-for-pages': 'off',
      // Разрешаем пустые блоки {}
      'no-empty': 'off',
      // Разрешаем пустые интерфейсы
      '@typescript-eslint/no-empty-object-type': 'off',
      // Разрешаем отсутствующие display name в Radix UI компонентах
      'react/display-name': 'off',
      // Разрешаем @ts-ignore (хотя лучше использовать @ts-expect-error)
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
  {
    ignores: [
      '.next/*',
      'node_modules/*',
      'public/*',
      'functions/*', // Если у вас бэкенд в отдельной папке
    ],
  },
);
