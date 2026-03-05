import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/server"],
  // Use the dedicated Jest tsconfig that relaxes noUnusedLocals/noUnusedParameters
  // so mock files and test helpers don't cause TypeScript compilation errors.
  globals: {
    "ts-jest": {
      tsconfig: "<rootDir>/tsconfig.jest.json",
    },
  },
  // moduleNameMapper resolves imports at any relative depth to the correct mock.
  // The patterns use a non-greedy prefix so they work whether the importing file
  // is one level deep (../db) or two levels deep (../../db), etc.
  moduleNameMapper: {
    // Mock the db module regardless of relative depth
    "^(?:\\.{1,2}/)+db$": "<rootDir>/server/__mocks__/db.ts",
    // Mock the schema module regardless of relative depth
    "^(?:\\.{1,2}/)+schema$": "<rootDir>/server/__mocks__/schema.ts",
    // Mock the schema when imported as db/schema
    "^(?:\\.{1,2}/)+db/schema$": "<rootDir>/server/__mocks__/schema.ts",
    // Mock webpush lib for route tests (the webpush unit test bypasses this
    // by mocking 'web-push' directly instead)
    "^(?:\\.{1,2}/)+lib/webpush$": "<rootDir>/server/__mocks__/webpush.ts",
  },
  setupFiles: ["<rootDir>/server/__tests__/setup.ts"],
  // Collect coverage from all server source files, excluding mocks and tests
  collectCoverageFrom: [
    "server/**/*.ts",
    "!server/__tests__/**",
    "!server/__mocks__/**",
  ],
};

export default config;
