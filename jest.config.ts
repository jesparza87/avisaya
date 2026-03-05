import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/server"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^../db$": "<rootDir>/server/__mocks__/db.ts",
    "^../lib/socket$": "<rootDir>/server/__mocks__/socket.ts",
    "^../lib/webpush$": "<rootDir>/server/__mocks__/webpush.ts",
  },
  clearMocks: true,
};

export default config;
