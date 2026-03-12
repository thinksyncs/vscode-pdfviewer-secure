const js = require('@eslint/js');
const globals = require('globals');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const prettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = [
  {
    ignores: ['out/**', 'node_modules/**', 'lib/**', '.vscode-test/**'],
  },
  js.configs.recommended,
  ...tsPlugin.configs['flat/recommended'],
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      'prettier/prettier': [
        'error',
        {
          singleQuote: true,
          endOfLine: 'auto',
        },
      ],
      'no-empty-function': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
  prettierRecommended,
];
