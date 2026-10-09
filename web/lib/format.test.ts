import { describe, expect, it } from "vitest";
import { formatBytes, formatDuration, formatWhen, titleFromFilename } from "./format";

describe("format helpers", () => {
  it("formats durations", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(207.4)).toBe("3:27");
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(formatDuration(null)).toBe("0:00");
  });

  it("formats relative times", () => {
    const now = Date.parse("2026-10-08T12:00:00Z");
    expect(formatWhen("2026-10-08T11:59:30Z", now)).toBe("Just now");
    expect(formatWhen("2026-10-08T11:55:00Z", now)).toBe("5 min ago");
    expect(formatWhen("2026-10-08T09:00:00Z", now)).toBe("3 h ago");
    expect(formatWhen("2026-10-04T09:00:00Z", now)).toBe("Oct 4");
  });

  it("formats sizes and titles", () => {
    expect(formatBytes(1840000000)).toBe("1.7 GB");
    expect(formatBytes(512)).toBe("512 B");
    expect(titleFromFilename("harbor-morning_4k.mov")).toBe("harbor morning 4k");
  });
});
