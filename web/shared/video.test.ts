import { describe, expect, it } from "vitest";
import { hlsFolder, originalKey } from "./video";

describe("storage keys", () => {
  it("builds the original key from a safe version of the filename", () => {
    expect(originalKey("abc", "My Holiday (final).mp4")).toBe("originals/abc/My-Holiday-final-.mp4");
    expect(originalKey("abc", "../../etc/passwd")).toBe("originals/abc/etc-passwd");
    expect(originalKey("abc", "ünïcôdé.mov")).toBe("originals/abc/unicode.mov");
    expect(originalKey("abc", "???")).toBe("originals/abc/video");
  });

  it("builds the HLS folder", () => {
    expect(hlsFolder("abc")).toBe("hls/abc/");
  });
});
