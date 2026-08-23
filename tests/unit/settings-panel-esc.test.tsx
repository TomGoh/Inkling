import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { SettingsPanel } from "../../src/components/Settings/SettingsPanel";

describe("SettingsPanel Esc keydown (#130)", () => {
  it("triggers onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<SettingsPanel onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
