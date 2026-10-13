import { describe, expect, it } from "vitest";
import {
  buildHlsArgs,
  buildThumbnailArgs,
  cacheControlFor,
  contentTypeFor,
  copyBlockers,
  describePlan,
  parseProbe,
  planHls,
  thumbnailSeconds,
  type ProbeResult,
  type VideoInfo,
} from "./hls";

const h264_1080: VideoInfo = { codec: "h264", profile: "High", pixFmt: "yuv420p", width: 1920, height: 1080, rotation: 0, bitRateKbps: 3000 };
const probe = (video: Partial<VideoInfo> = {}, audio: ProbeResult["audio"] = { codec: "aac" }): ProbeResult => ({
  duration: 7200,
  video: { ...h264_1080, ...video },
  audio,
});

describe("planHls: copy or encode?", () => {
  it("copies a browser-friendly H.264 file and adds 480p", () => {
    expect(planHls(probe())).toEqual({ mode: "copy", topName: "1080p", add480: true, audio: "copy" });
  });

  it("converts only the audio when it isn't AAC", () => {
    expect(planHls(probe({}, { codec: "ac3" }))).toMatchObject({ mode: "copy", audio: "aac" });
    expect(planHls(probe({}, null))).toMatchObject({ mode: "copy", audio: "none" });
  });

  it("skips the 480p encode when the original is already light", () => {
    // e.g. a 540x960 phone video at 515 kbit/s: a "smaller" 480p version would be heavier.
    expect(planHls(probe({ width: 540, height: 960, bitRateKbps: 515 }))).toMatchObject({ mode: "copy", topName: "540p", add480: false });
  });

  it("measures portrait videos by their short side", () => {
    expect(planHls(probe({ width: 1080, height: 1920, bitRateKbps: 6000 }))).toMatchObject({ mode: "copy", topName: "1080p", add480: true });
    expect(copyBlockers({ ...h264_1080, width: 1080, height: 1920 })).toEqual([]);
  });

  it("skips the 480p encode for small originals", () => {
    expect(planHls(probe({ width: 854, height: 480 }))).toMatchObject({ mode: "copy", topName: "480p", add480: false });
  });

  it("encodes when copying wouldn't play everywhere", () => {
    expect(copyBlockers({ ...h264_1080, codec: "hevc" })[0]).toContain("hevc");
    expect(copyBlockers({ ...h264_1080, pixFmt: "yuv420p10le" })).toHaveLength(1);
    expect(copyBlockers({ ...h264_1080, profile: "High 10" })).toHaveLength(1);
    expect(copyBlockers({ ...h264_1080, rotation: -90 })[0]).toContain("rotated");
    expect(copyBlockers({ ...h264_1080, height: 2160, width: 3840 })[0]).toContain("2160p");
    expect(copyBlockers({ ...h264_1080, bitRateKbps: 40_000 })[0]).toContain("bitrate");
    expect(planHls(probe({ codec: "hevc" }))).toMatchObject({ mode: "encode", audio: "aac" });
  });

  it("describes the plan for the logs", () => {
    expect(describePlan(planHls(probe()))).toBe("copy 1080p + encode 480p, audio copy");
    expect(describePlan(planHls(probe({ codec: "hevc" })))).toContain("encode 480p + 720p (video codec is hevc");
  });
});

describe("buildHlsArgs", () => {
  it("copy plan: copies the original, encodes 480p with matching keyframes", () => {
    const args = buildHlsArgs("/tmp/in.mp4", "/tmp/out", planHls(probe()));
    const joined = args.join(" ");
    expect(joined).toContain("-filter_complex [0:v]scale=w='if(gt(iw,ih),-2,480)':h='if(gt(iw,ih),480,-2)'[v480p]");
    expect(joined).toContain("-map 0:v:0 -c:v:0 copy");
    expect(joined).toContain("-c:v:1 libx264 -crf:v:1 23 -maxrate:v:1 1400k");
    expect(joined).toContain("-force_key_frames:v:1 source");
    expect(joined).toContain("-c:a copy");
    expect(joined).toContain("v:0,a:0,name:1080p v:1,a:1,name:480p");
    expect(args.at(-1)).toBe("/tmp/out/%v/index.m3u8");
  });

  it("copy plan for a small original: a single copied rendition", () => {
    const joined = buildHlsArgs("in.mp4", "/o", planHls(probe({ width: 640, height: 360 }))).join(" ");
    expect(joined).not.toContain("libx264");
    expect(joined).not.toContain("filter_complex");
    expect(joined).toContain("-var_stream_map v:0,a:0,name:360p");
  });

  it("encode plan: 480p + 720p at CRF 23 with 6-second keyframes", () => {
    const joined = buildHlsArgs("in.mp4", "/o", planHls(probe({ codec: "hevc" }))).join(" ");
    expect(joined).toContain("[0:v]split=2[v0][v1];[v0]scale=w='if(gt(iw,ih),-2,480)':h='if(gt(iw,ih),480,-2)'[v480p];[v1]scale=w='if(gt(iw,ih),-2,720)':h='if(gt(iw,ih),720,-2)'[v720p]");
    expect(joined).toContain("-c:v:0 libx264 -crf:v:0 23 -maxrate:v:0 1400k -bufsize:v:0 2800k");
    expect(joined).toContain("-c:v:1 libx264 -crf:v:1 23 -maxrate:v:1 2800k -bufsize:v:1 5600k");
    expect(joined).toContain("expr:gte(t,n_forced*6)");
    expect(joined).toContain("-c:a aac");
    expect(joined).toContain("v:0,a:0,name:480p v:1,a:1,name:720p");
  });

  it("silent videos have no audio maps", () => {
    const joined = buildHlsArgs("in.mp4", "/o", planHls(probe({}, null))).join(" ");
    expect(joined).not.toContain("0:a:0");
    expect(joined).toContain("v:0,name:1080p v:1,name:480p");
  });
});

describe("parseProbe", () => {
  it("reads codec, size, rotation, bitrate and audio", () => {
    const json = JSON.stringify({
      format: { duration: "12.5", bit_rate: "3500000" },
      streams: [
        { codec_type: "video", codec_name: "h264", profile: "High", pix_fmt: "yuv420p", width: 1280, height: 720, side_data_list: [{ rotation: -90 }] },
        { codec_type: "audio", codec_name: "aac" },
      ],
    });
    expect(parseProbe(json)).toEqual({
      duration: 12.5,
      video: { codec: "h264", profile: "High", pixFmt: "yuv420p", width: 1280, height: 720, rotation: -90, bitRateKbps: 3500 },
      audio: { codec: "aac" },
    });
  });

  it("rejects files without a video track", () => {
    expect(() => parseProbe(JSON.stringify({ format: { duration: "3" }, streams: [{ codec_type: "audio" }] }))).toThrow("no video track");
  });
});

describe("thumbnails and upload headers", () => {
  it("picks 10% in, capped at 10 seconds", () => {
    expect(thumbnailSeconds(30)).toBe(3);
    expect(thumbnailSeconds(3600)).toBe(10);
    expect(thumbnailSeconds(Number.NaN)).toBe(0);
  });

  it("grabs one 720p frame", () => {
    expect(buildThumbnailArgs("in.mp4", "t.jpg", 3).join(" ")).toBe("-hide_banner -y -ss 3.00 -i in.mp4 -frames:v 1 -vf scale=-2:720 -q:v 3 t.jpg");
  });

  it("sets content types and caching", () => {
    expect(contentTypeFor("master.m3u8")).toBe("application/vnd.apple.mpegurl");
    expect(contentTypeFor("720p/seg_001.ts")).toBe("video/mp2t");
    expect(contentTypeFor("thumbnail.jpg")).toBe("image/jpeg");
    expect(cacheControlFor("seg_001.ts")).toContain("immutable");
    expect(cacheControlFor("index.m3u8")).toBe("public, max-age=300");
  });
});
