import type { Report } from "@veritas/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { store } from "../src/store/index.js";
import { aiDeclaredJpeg } from "./imageFixtures.js";

const app = createApp();
const ARTICLE = `Officials said on Tuesday that the new bridge would open in May. "We are on schedule," said the project director, Anna Petrova, according to a statement. `.repeat(4);

async function waitForReport(id: string): Promise<Report> {
  for (let i = 0; i < 50; i++) {
    const res = await request(app).get(`/api/analyses/${id}`);
    if (res.body.status === "done" || res.body.status === "error") return res.body;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("timed out");
}

describe("POST /api/analyze", () => {
  it("analyzes pasted text end-to-end", async () => {
    const res = await request(app).post("/api/analyze").send({ kind: "text", text: ARTICLE, title: "Bridge to open in May" });
    expect(res.status).toBe(202);
    const report = await waitForReport(res.body.id);
    expect(report.status).toBe("done");
    expect(report.signals.map((s) => s.id).sort()).toEqual(["factcheck", "images", "linguistic", "presentation", "publisher", "timing"]);
    expect(report.signals.find((s) => s.id === "linguistic")?.status).toBe("done");
    expect(report.score).not.toBeNull();

    const history = await request(app).get("/api/analyses");
    expect(history.body.some((h: { id: string }) => h.id === res.body.id)).toBe(true);
  });

  it("rejects too-short text", async () => {
    const res = await request(app).post("/api/analyze").send({ kind: "text", text: "too short" });
    expect(res.status).toBe(400);
  });

  it.each(["http://127.0.0.1/admin", "http://169.254.169.254/latest/meta-data", "file:///etc/passwd"])("rejects unsafe URL %s", async (url) => {
    const res = await request(app).post("/api/analyze").send({ kind: "url", url });
    expect(res.status).toBe(400);
  });

  it("404s on unknown analysis", async () => {
    expect((await request(app).get("/api/analyses/nope")).status).toBe(404);
  });

  it("streams a finished report over SSE", async () => {
    const { body } = await request(app).post("/api/analyze").send({ kind: "text", text: ARTICLE });
    await waitForReport(body.id);
    const res = await request(app).get(`/api/analyses/${body.id}/events`);
    expect(res.headers["content-type"]).toMatch(/event-stream/);
    expect(res.text).toMatch(/"type":"done"/);
  });
});

describe("POST /api/analyze/image", () => {
  it("analyzes an upload, serves thumbnail + heatmap, and discards the original", async () => {
    const res = await request(app).post("/api/analyze/image").attach("image", await aiDeclaredJpeg(), "photo.jpg").field("caption", "Flooded street today");
    expect(res.status).toBe(202);
    const report = await waitForReport(res.body.id);
    expect(report.status).toBe("done");
    expect(report.inputKind).toBe("image");
    expect(report.signals.map((s) => s.id)).toEqual(["images"]);
    expect(report.images[0]).toMatchObject({ hasThumbnail: true, hasHeatmap: true });
    expect(report.band).toBe("likely_false");
    expect(report.coverage).toBeGreaterThan(0.8); // measured against the signals that apply to images

    for (const kind of ["thumb", "ela"]) {
      const img = await request(app).get(`/api/analyses/${res.body.id}/images/0/${kind}`);
      expect(img.status).toBe(200);
      expect(img.headers["content-type"]).toBe("image/jpeg");
      expect(img.headers["x-content-type-options"]).toBe("nosniff");
    }
    expect((await request(app).get(`/api/analyses/${res.body.id}/images/0/upload`)).status).toBe(404);
    expect(await store.getArtifact(res.body.id, 0, "upload")).toBeNull();
  });

  it("rejects a non-image disguised as a JPEG", async () => {
    const res = await request(app).post("/api/analyze/image").attach("image", Buffer.from("<script>alert(1)</script>"), { filename: "x.jpg", contentType: "image/jpeg" });
    expect(res.status).toBe(415);
  });

  it("rejects files over 10 MB", async () => {
    const res = await request(app).post("/api/analyze/image").attach("image", Buffer.alloc(10 * 1024 * 1024 + 1), "big.jpg");
    expect(res.status).toBe(413);
  });

  it("requires a file", async () => {
    expect((await request(app).post("/api/analyze/image").field("caption", "x")).status).toBe(400);
  });
});
