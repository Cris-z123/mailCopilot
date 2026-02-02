import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'build/**',
      'node_modules/**',
      'coverage/**',
      '*.config.js',
      '*.config.ts',
      'vite.config.ts',
      'vitest.config.ts',
      'electron-builder.yml',
    ],
  },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parser: tseslint.parser,
      parserOptions: {
        project: ['./tsconfig.json'],
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      react: reactPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // ========================================
      // React Hooks Rules (from recommended config)
      // ========================================
      ...reactHooks.configs.recommended.rules,

      // ========================================
      // React Core Rules (from recommended config)
      // ========================================
      // Rules that are 'error' level in eslint-plugin-react recommended config
      'react/jsx-key': 'error',
      'react/jsx-no-comment-textnodes': 'error',
      'react/jsx-no-duplicate-props': 'error',
      'react/jsx-no-undef': 'error',
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      'react/no-children-prop': 'error',
      'react/no-danger-with-children': 'error',
      'react/no-deprecated': 'error',
      'react/no-direct-mutation-state': 'error',
      'react/no-find-dom-node': 'error',
      'react/no-is-mounted': 'error',
      'react/no-render-return-value': 'error',
      'react/no-unknown-property': 'error',
      'react/no-string-refs': 'error',
      'react/require-render-return': 'error',
      'react/react-in-jsx-scope': 'off', // React 17+ doesn't need it

      // Rules that are 'warn' level in eslint-plugin-react recommended config
      'react/no-array-index-key': 'warn',
      'react/no-unescaped-entities': 'warn',
      'react/self-closing-comp': 'warn',
      'react/jsx-no-target-blank': 'warn',

      // Disabled/Customized rules
      'react/prop-types': 'off', // We use TypeScript
      'react/react-in-jsx-scope': 'off', // React 17+ doesn't need it
      'react/display-name': 'off', // Not needed for modern React

      // ========================================
      // React Refresh Rules (for Fast Refresh)
      // ========================================
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],

      // ========================================
      // TypeScript Rules
      // ========================================
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  }
);
