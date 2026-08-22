import { describe, it, expect } from "vitest";
import { useWorkspace } from "../../src/store/workspace";

describe("Issue #91: Save in progress states", () => {
  it("should maintain isSaving state accurately", () => {
    useWorkspace.setState({ isSaving: false });
    expect(useWorkspace.getState().isSaving).toBe(false);
    useWorkspace.setState({ isSaving: true });
    expect(useWorkspace.getState().isSaving).toBe(true);
  });
});
