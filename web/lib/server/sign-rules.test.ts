import { describe, expect, it } from "vitest";
import { decideSign } from "./sign-rules";

const video = { status: "uploading" as const, original_key: "originals/abc/clip.mp4", user_id: "user-1" };
const me = "user-1";
const key = video.original_key;

describe("decideSign", () => {
  it("allows every multipart step for the video's own key", () => {
    expect(decideSign(video, { method: "POST", key }, me)).toMatchObject({ ok: true, request: { kind: "create" } });
    expect(decideSign(video, { method: "PUT", key, uploadId: "u1", partNumber: 3 }, me)).toMatchObject({
      ok: true,
      request: { kind: "uploadPart", partNumber: 3 },
    });
    expect(decideSign(video, { method: "POST", key, uploadId: "u1" }, me)).toMatchObject({ ok: true, request: { kind: "complete" } });
    expect(decideSign(video, { method: "DELETE", key, uploadId: "u1" }, me)).toMatchObject({ ok: true, request: { kind: "abort" } });
    expect(decideSign(video, { method: "GET", key, uploadId: "u1" }, me)).toMatchObject({ ok: true, request: { kind: "listParts" } });
  });

  it("refuses a different key", () => {
    expect(decideSign(video, { method: "POST", key: "originals/other/x.mp4" }, me)).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses when the video is no longer uploading", () => {
    expect(decideSign({ ...video, status: "queued" }, { method: "POST", key }, me)).toMatchObject({ ok: false, status: 409 });
  });

  it("still allows aborting after the video was marked failed (cancel race)", () => {
    expect(decideSign({ ...video, status: "failed" }, { method: "DELETE", key, uploadId: "u1" }, me)).toMatchObject({
      ok: true,
      request: { kind: "abort" },
    });
    expect(decideSign({ ...video, status: "failed" }, { method: "PUT", key, uploadId: "u1", partNumber: 1 }, me)).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(decideSign({ ...video, status: "ready" }, { method: "DELETE", key, uploadId: "u1" }, me)).toMatchObject({ ok: false });
  });

  it("refuses someone else's upload", () => {
    expect(decideSign(video, { method: "POST", key }, "user-2")).toMatchObject({ ok: false, status: 403 });
    expect(decideSign({ ...video, user_id: null }, { method: "POST", key }, me)).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses a missing video", () => {
    expect(decideSign(null, { method: "POST", key }, me)).toMatchObject({ ok: false, status: 404 });
  });

  it("refuses single PUTs and plain DELETEs (no uploadId)", () => {
    expect(decideSign(video, { method: "PUT", key }, me)).toMatchObject({ ok: false, status: 400 });
    expect(decideSign(video, { method: "DELETE", key }, me)).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses out-of-range part numbers", () => {
    expect(decideSign(video, { method: "PUT", key, uploadId: "u1", partNumber: 0 }, me)).toMatchObject({ ok: false });
    expect(decideSign(video, { method: "PUT", key, uploadId: "u1", partNumber: 10_001 }, me)).toMatchObject({ ok: false });
    expect(decideSign(video, { method: "PUT", key, uploadId: "u1" }, me)).toMatchObject({ ok: false });
  });
});
