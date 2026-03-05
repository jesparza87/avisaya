// Global test environment setup — runs before every test file.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-key";
// Stub VAPID vars so any code that reads them in test context has valid values.
// The actual initVapid() is mocked via __mocks__/webpush.ts and never called
// in route tests; the webpush unit test overrides these per-test as needed.
process.env.VAPID_SUBJECT = "mailto:test@example.com";
process.env.VAPID_PUBLIC_KEY =
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
process.env.VAPID_PRIVATE_KEY = "UUxI4O8-HoKU6QKJ_LH_zO1nq1E1phbRjBeZI9b35Ps";
