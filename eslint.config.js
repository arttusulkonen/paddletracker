// eslint.config.js
import tseslint from 'typescript-eslint';

export default [
  tseslint.config({
    files: ['**/*.ts', '**/*.tsx'],
    project: './tsconfig.json',
  }),
];
