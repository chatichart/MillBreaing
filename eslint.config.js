const spfxProfile = require('@microsoft/eslint-config-spfx/lib/flat-profiles/react');

module.exports = [
  { ignores: ['tests/**', 'vite.config.ts', 'vitest.config.ts', 'dist-preview/**'] },
  ...spfxProfile,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Persisted JSON explicitly uses null; async event handlers deliberately discard handled promises.
      '@rushstack/no-new-null': 'off',
      'no-void': ['error', { allowAsStatement: true }]
    },
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: './tsconfig.json'
      }
    }
  }
];
