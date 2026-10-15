const ionic = require('@ionic/eslint-config/recommended');

module.exports = [
  {
    ignores: [
      'build/**',
      'dist/**',
      'node_modules/**',
      'android/**',
      'eslint.config.cjs',
    ],
  },
  ...ionic,
];
