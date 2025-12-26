// eslint.config.mjs
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Глобальный игнор
    ignores: [
      '.next/**', 
      '.firebase/**', 
      'node_modules/**', 
      'public/**',
      'out/**',
      'build/**',
			'scripts/**',
      '**/*.d.ts',
      'functions/lib/**' // Игнорируем скомпилированный JS в функциях
    ],
  },

  // 1. ОБЩАЯ КОНФИГУРАЦИЯ ДЛЯ ВСЕХ TS/TSX ФАЙЛОВ (И Frontend, и Backend)
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    languageOptions: {
      parser: tseslint.parser, // Принудительно используем TS парсер
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      // --- Чистка импортов ---
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        { 
          'vars': 'all', 
          'varsIgnorePattern': '^_', 
          'args': 'after-used', 
          'argsIgnorePattern': '^_' 
        }
      ],
      // --- Отключаем назойливые правила ---
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-empty': 'off',
      'no-constant-binary-expression': 'off',
      'no-undef': 'off', // TypeScript сам следит за этим
    },
  },

  // 2. СПЕЦИФИКА FRONTEND (Next.js / React)
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // 3. СПЕЦИФИКА BACKEND (Functions, Scripts, Configs)
  {
    files: [
      'functions/src/**/*.{ts,tsx}', 
      'scripts/**/*.{ts,js,cjs}', 
      '*.config.ts',
      'middleware.ts'
    ],
    languageOptions: {
      globals: {
        ...globals.node, // Добавляет process, require, console
        ...globals.es2021,
      },
    },
    rules: {
      'no-console': 'off', // На бэкенде консоль нужна
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    }
  },

  // 4. СПЕЦИФИКА JS ФАЙЛОВ (Скрипты .cjs, .js)
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      }
    },
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
      'no-undef': 'off'
    }
  }
);