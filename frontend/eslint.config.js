import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import boundaries from 'eslint-plugin-boundaries';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'coverage',
      '.husky',
      '.storybook',
      'public',
      'storybook-static',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
      boundaries,
    },
    settings: {
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app/**' },
        { type: 'feature', pattern: 'src/features/*', mode: 'folder', capture: ['name'] },
        { type: 'realtime', pattern: 'src/realtime/**' },
        { type: 'design-system', pattern: 'src/design-system/**' },
        { type: 'lib', pattern: 'src/lib/**' },
        { type: 'shared', pattern: 'src/shared/**' },
        { type: 'styles', pattern: 'src/styles/**' },
        { type: 'tests', pattern: 'src/tests/**' },
        { type: 'root', pattern: 'src/(main|App).tsx', mode: 'file' },
      ],
      'boundaries/ignore': ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
      'import/resolver': {
        typescript: true,
        node: true,
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,

      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],

      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'app', allow: ['app', 'feature', 'design-system', 'lib', 'shared', 'realtime', 'styles'] },
            {
              from: 'feature',
              allow: [
                ['feature', { name: '${from.name}' }],
                'design-system',
                'lib',
                'shared',
                'realtime',
              ],
            },
            { from: 'design-system', allow: ['design-system', 'lib', 'shared'] },
            { from: 'lib', allow: ['lib', 'shared'] },
            { from: 'shared', allow: ['shared'] },
            { from: 'realtime', allow: ['realtime', 'lib', 'shared'] },
            { from: 'root', allow: ['root', 'app', 'feature', 'design-system', 'lib', 'shared', 'realtime', 'styles'] },
            { from: 'tests', allow: ['app', 'feature', 'design-system', 'lib', 'shared', 'realtime', 'styles', 'tests'] },
            { from: 'styles', allow: ['styles'] },
          ],
        },
      ],
      'boundaries/entry-point': [
        'error',
        {
          default: 'disallow',
          rules: [
            { target: ['feature'], allow: 'index.ts' },
            { target: ['app', 'design-system', 'lib', 'shared', 'realtime', 'styles', 'tests', 'root'], allow: '**' },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'src/tests/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['vite.config.ts', 'vitest.config.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: null,
      },
    },
  },
);
