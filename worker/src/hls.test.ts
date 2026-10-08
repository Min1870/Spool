import { describe, expect, it } from "vitest";
import { buildHlsArgs, buildThumbnailArgs, cacheControlFor, contentTypeFor, parseProbe, thumbnailSeconds } from "./hls";

describe("buildHlsArgs", () => {
  const withAudio = buildHlsArgs("/tmp/in.mp4", "/tmp/out", { duration: 60, hasAudio: true });
  const joined = withAudio.join(" ");

  it("scales one decoded input to 480p and 720p", () => {
    expect(withAudio).toContain("-filter_complex");
    expect(joined).toContain("[0:v]split=2[v0][v1];[v0]scale=-2:480[v480p];[v1]scale=-2:720[v720p]");
  });

  it("uses H.264 at CRF 23 with 6-second segments and a master playlist", () => {
    expect(joined).toContain("-c:v:0 libx264 -crf:v:0 23 -maxrate:v:0 1400k -bufsize:v:0 2800k");
    expect(joined).toContain("-c:v:1 libx264 -crf:v:1 23 -maxrate:v:1 2800k -bufsize:v:1 5600k");
    expect(joined).toContain("-hls_time 6");
    expect(joined).toContain("-master_pl_name master.m3u8");
    expect(joined).toContain("expr:gte(t,n_forced*6)");
    expect(withAudio.at(-1)).toBe("/tmp/out/%v/index.m3u8");
  });

  it("pairs each rendition with the audio track", () => {
    expect(withAudio.filter((a) => a === "0:a:0")).toHaveLength(2);
    expect(joined).toContain("v:0,a:0,name:480p v:1,a:1,name:720p");
  });

  it("leaves audio out for silent videos", () => {
    const silent = buildHlsArgs("/tmp/in.mp4", "/tmp/out", { duration: 60, hasAudio: false }).join(" ");
    expect(silent).not.toContain("0:a:0");
    expect(silent).not.toContain("-c:a");
    expect(silent).toContain("v:0,name:480p v:1,name:720p");
  });
});

describe("thumbnails", () => {
  it("picks 10% in, capped at 10 seconds", () => {
    expect(thumbnailSeconds(30)).toBe(3);
    expect(thumbnailSeconds(3600)).toBe(10);
    expect(thumbnailSeconds(0)).toBe(0);
    expect(thumbnailSeconds(Number.NaN)).toBe(0);
  });

  it("grabs one 720p frame", () => {
    expect(buildThumbnailArgs("in.mp4", "t.jpg", 3).join(" ")).toBe(
      "-hide_banner -y -ss 3.00 -i in.mp4 -frames:v 1 -vf scale=-2:720 -q:v 3 t.jpg",
    );
  });
});

describe("parseProbe", () => {
  it("reads duration and audio presence", () => {
    const json = JSON.stringify({ format: { duration: "12.5" }, streams: [{ codec_type: "video" }, { codec_type: "audio" }] });
    expect(parseProbe(json)).toEqual({ duration: 12.5, hasAudio: true });
  });

  it("rejects files without a video track", () => {
    expect(() => parseProbe(JSON.stringify({ format: { duration: "3" }, streams: [{ codec_type: "audio" }] }))).toThrow(
      "no video track",
    );
  });
});

describe("upload headers", () => {
  it("sets content types players expect", () => {
    expect(contentTypeFor("master.m3u8")).toBe("application/vnd.apple.mpegurl");
    expect(contentTypeFor("720p/seg_001.ts")).toBe("video/mp2t");
    expect(contentTypeFor("thumbnail.jpg")).toBe("image/jpeg");
  });

  it("caches segments forever and playlists briefly", () => {
    expect(cacheControlFor("seg_001.ts")).toContain("immutable");
    expect(cacheControlFor("index.m3u8")).toBe("public, max-age=300");
  });
});
