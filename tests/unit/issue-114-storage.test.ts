import { describe, it, expect, beforeEach } from "vitest";
import { loadJSON, writeJSON } from "../../src/lib/storage";

describe("Issue #114: Safe local storage helper", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should load default when key is missing or corrupted", () => {
    expect(loadJSON("non-existent", { count: 0 })).toEqual({ count: 0 });
    localStorage.setItem("corrupted", "{invalid_json");
    expect(loadJSON("corrupted", { ok: false })).toEqual({ ok: false });
  });

  it("should persist and read JSON data accurately", () => {
    writeJSON("valid_key", { a: 1, b: "test" });
    expect(loadJSON("valid_key", {})).toEqual({ a: 1, b: "test" });
  });
});
