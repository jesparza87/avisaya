/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/server/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^../db$": "<rootDir>/server/__mocks__/db.ts",
    "^../schema$": "<rootDir>/server/__mocks__/schema.ts",
    "^../middleware/auth$": "<rootDir>/server/__mocks__/auth.ts"
  },
  globals: {
    "ts-jest": {
      tsconfig: "tsconfig.server.json"
    }
  }
};
