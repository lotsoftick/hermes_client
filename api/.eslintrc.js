module.exports = {
  extends: ['airbnb-base', 'airbnb-typescript/base', 'prettier'],
  parserOptions: { project: ['tsconfig.json'], tsconfigRootDir: __dirname },
  settings: {
    'import/resolver': {
      node: { paths: [__dirname] },
    },
  },
  rules: {
    'max-len': [1, 160, 4],
    'object-curly-newline': 'off',
    'newline-per-chained-call': 'off',
    'no-underscore-dangle': 'off',
    'class-methods-use-this': 'off',
    'no-prototype-builtins': 'off',
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: ['**/*.test.ts', '**/*.spec.ts'],
        packageDir: __dirname,
      },
    ],
  },
};
