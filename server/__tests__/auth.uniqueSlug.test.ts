/**
 * Tests for the uniqueSlug helper in server/routes/auth.ts.
 *
 * Verifies that:
 *  - The base slug is returned when no conflicts exist
 *  - Numeric suffixes are appended correctly when conflicts exist
 *  - Slugs like "bar-restaurant" do NOT cause false positives for base "bar"
 *    (the DB query uses a regex, not LIKE, so the mock correctly returns nothing)
 *  - Non-sequential gaps are handled (returns the lowest available suffix)
 */

process.env.NODE_ENV = "test";

jest.mock("web-push", () => ({ setVapidDetails: jest.fn() }));
jest.mock("../lib/socket", () => ({ setIo: jest.fn(), getIo: jest.fn() }));
jest.mock("../db", () => require("../__mocks__/db"));
jest.mock("../schema", () => require("../__mocks__/schema"));

import { db } from "../__mocks__/db";
import { uniqueSlug } from "../routes/auth";

function mockSlugQuery(slugs: string[]) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(slugs.map((slug) => ({ slug }))),
  };
  (db.select as jest.Mock).mockReturnValueOnce(chain);
}

describe("uniqueSlug", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the base slug when no conflicts exist", async () => {
    mockSlugQuery([]);
    expect(await uniqueSlug("bar")).toBe("bar");
  });

  it("returns base-2 when base is taken", async () => {
    mockSlugQuery(["bar"]);
    expect(await uniqueSlug("bar")).toBe("bar-2");
  });

  it("returns base-3 when base and base-2 are taken", async () => {
    mockSlugQuery(["bar", "bar-2"]);
    expect(await uniqueSlug("bar")).toBe("bar-3");
  });

  it("does NOT produce a false positive for 'bar-restaurant' when base is 'bar'", async () => {
    // The regex `^bar-[0-9]+$` does not match "bar-restaurant",
    // so the DB correctly returns nothing — base slug is available.
    mockSlugQuery([]);
    expect(await uniqueSlug("bar")).toBe("bar");
  });

  it("handles non-sequential gaps and returns the lowest available suffix", async () => {
    // bar, bar-2, and bar-4 exist — bar-3 should be returned
    mockSlugQuery(["bar", "bar-2", "bar-4"]);
    expect(await uniqueSlug("bar")).toBe("bar-3");
  });

  it("works correctly for multi-word base slugs", async () => {
    mockSlugQuery(["my-bar", "my-bar-2"]);
    expect(await uniqueSlug("my-bar")).toBe("my-bar-3");
  });
});
