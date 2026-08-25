import { describe, it, expect, beforeEach, vi } from "vitest";
import { persistDeletedSnapshot, loadDeletedSnapshots, clearDeletedSnapshots } from "../../src/store/workspace/shared";
import { writeJSON } from "../../src/lib/storage";

describe("deleted snapshot storage quota handling", () => {
  beforeEach(() => {
    localStorage.clear();
    clearDeletedSnapshots();
    vi.restoreAllMocks();
  });

  it("writeJSON returns true on success and false on QuotaExceededError", () => {
    const success = writeJSON("test-key", { hello: "world" });
    expect(success).toBe(true);

    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    });

    const failed = writeJSON("test-key-2", { large: "data" });
    expect(failed).toBe(false);
  });

  it("persistDeletedSnapshot returns false and falls back when storage fails", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError", "QuotaExceededError");
    });

    const result = persistDeletedSnapshot("/path/file.md", "some content");
    expect(result).toBe(false);
  });

  it("persistDeletedSnapshot succeeds under normal conditions", () => {
    const result = persistDeletedSnapshot("/path/file.md", "some content");
    expect(result).toBe(true);
    const list = loadDeletedSnapshots();
    expect(list.length).toBe(1);
    expect(list[0].path).toBe("/path/file.md");
    expect(list[0].content).toBe("some content");
  });
});
