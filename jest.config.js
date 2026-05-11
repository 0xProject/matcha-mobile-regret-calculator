/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', 'integration-check'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { module: 'commonjs' } }],
  },
  // viem has a large ESM-only module tree that can cause Jest's haste-map
  // file scanner to time out. It is server-only and never imported in tests,
  // so we exclude it from the module registry entirely.
  modulePathIgnorePatterns: ['<rootDir>/node_modules/viem'],
};

module.exports = config;
