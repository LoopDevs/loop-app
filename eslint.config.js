const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    ignores: ['src/constants/theme.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#[0-9A-Fa-f]{3,8}$/]',
          message: 'Colour values live in src/constants/theme.ts. Read them through useTheme().',
        },
        {
          selector: 'Literal[value=/rgba?\\(/]',
          message: 'Colour values live in src/constants/theme.ts. Read them through useTheme() or Elevation.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/constants/theme',
              importNames: ['Colors'],
              message: 'Read colours through useTheme() so every screen follows the same scheme.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/hooks/use-theme.ts', 'src/hooks/page-layout.ts', 'src/app/+html.tsx'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
]);
