import { describe, expect, it, vi } from "vitest";
import { cancelConnectorFrame } from "./useConnectorGeometry";

describe("connector frame lifecycle", () => {
  it("clears the pending frame after cancellation so Strict Mode can reschedule", () => {
    const frame = { current: 42 };
    const cancel = vi.fn();

    cancelConnectorFrame(frame, cancel);

    expect(cancel).toHaveBeenCalledWith(42);
    expect(frame.current).toBeNull();
  });
});
