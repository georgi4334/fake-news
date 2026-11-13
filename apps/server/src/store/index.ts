import { PrismaClient, type Prisma } from "@prisma/client";
import type { AnalysisStatus, ArticleMeta, Band, HistoryItem, ImageCheck, InputKind, Report, SignalResult } from "@veritas/shared";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";

export interface AnalysisRecord {
  id: string;
  inputKind: InputKind;
  status: AnalysisStatus;
  input: unknown;
  meta: ArticleMeta | null;
  signals: SignalResult[];
  score: number | null;
  band: Band;
  coverage: number;
  topReasons: string[];
  images: ImageCheck[];
  error: string | null;
  createdAt: Date;
}

export type ArtifactKind = "thumb" | "ela" | "upload";
export interface Artifact {
  mime: string;
  data: Buffer;
}

type Patch = Partial<Omit<AnalysisRecord, "id" | "createdAt" | "inputKind" | "input">>;

export interface Store {
  create(inputKind: InputKind, input: unknown): Promise<AnalysisRecord>;
  get(id: string): Promise<AnalysisRecord | null>;
  update(id: string, patch: Patch): Promise<void>;
  list(limit: number): Promise<AnalysisRecord[]>;
  cacheGet(key: string): Promise<unknown | undefined>;
  cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  putArtifact(analysisId: string, index: number, kind: ArtifactKind, artifact: Artifact): Promise<void>;
  getArtifact(analysisId: string, index: number, kind: ArtifactKind): Promise<Artifact | null>;
  deleteArtifact(analysisId: string, index: number, kind: ArtifactKind): Promise<void>;
}

const artifactKey = (id: string, index: number, kind: ArtifactKind) => `${id}:${index}:${kind}`;

class MemoryStore implements Store {
  private rows = new Map<string, AnalysisRecord>();
  private kv = new Map<string, { value: unknown; expiresAt: number }>();
  private artifacts = new Map<string, Artifact>();
  async create(inputKind: InputKind, input: unknown) {
    const rec: AnalysisRecord = {
      id: randomUUID(), inputKind, input, status: "queued", meta: null, signals: [], score: null,
      band: "unknown", coverage: 0, topReasons: [], images: [], error: null, createdAt: new Date(),
    };
    this.rows.set(rec.id, rec);
    return structuredClone(rec);
  }
  async get(id: string) {
    const r = this.rows.get(id);
    return r ? structuredClone(r) : null;
  }
  async update(id: string, patch: Patch) {
    const r = this.rows.get(id);
    if (r) Object.assign(r, structuredClone(patch));
  }
  async list(limit: number) {
    return [...this.rows.values()].sort((a, b) => +b.createdAt - +a.createdAt).slice(0, limit).map((r) => structuredClone(r));
  }
  async cacheGet(key: string) {
    const e = this.kv.get(key);
    return e && e.expiresAt > Date.now() ? e.value : undefined;
  }
  async cacheSet(key: string, value: unknown, ttlSeconds: number) {
    this.kv.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
  async putArtifact(id: string, index: number, kind: ArtifactKind, a: Artifact) {
    this.artifacts.set(artifactKey(id, index, kind), a);
  }
  async getArtifact(id: string, index: number, kind: ArtifactKind) {
    return this.artifacts.get(artifactKey(id, index, kind)) ?? null;
  }
  async deleteArtifact(id: string, index: number, kind: ArtifactKind) {
    this.artifacts.delete(artifactKey(id, index, kind));
  }
}

class PrismaStore implements Store {
  constructor(private db = new PrismaClient()) {}
  private toRecord(row: Prisma.AnalysisGetPayload<object>): AnalysisRecord {
    return {
      id: row.id,
      inputKind: row.inputKind as InputKind,
      status: row.status as AnalysisStatus,
      input: row.input,
      meta: (row.meta as ArticleMeta | null) ?? null,
      signals: row.signals as SignalResult[],
      score: row.score,
      band: row.band as Band,
      coverage: row.coverage,
      images: (row.images as ImageCheck[] | null) ?? [],
      topReasons: row.topReasons as string[],
      error: row.error,
      createdAt: row.createdAt,
    };
  }
  async create(inputKind: InputKind, input: unknown) {
    return this.toRecord(await this.db.analysis.create({ data: { inputKind, input: input as Prisma.InputJsonValue } }));
  }
  async get(id: string) {
    const row = await this.db.analysis.findUnique({ where: { id } });
    return row ? this.toRecord(row) : null;
  }
  async update(id: string, patch: Patch) {
    const { meta, signals, topReasons, images, ...rest } = patch;
    await this.db.analysis.update({
      where: { id },
      data: {
        ...rest,
        ...(meta !== undefined && { meta: meta as Prisma.InputJsonValue }),
        ...(signals !== undefined && { signals: signals as Prisma.InputJsonValue }),
        ...(topReasons !== undefined && { topReasons }),
        ...(images !== undefined && { images: images as Prisma.InputJsonValue }),
      },
    });
  }
  async list(limit: number) {
    const rows = await this.db.analysis.findMany({ orderBy: { createdAt: "desc" }, take: limit });
    return rows.map((r) => this.toRecord(r));
  }
  async cacheGet(key: string) {
    const e = await this.db.cacheEntry.findUnique({ where: { key } });
    return e && e.expiresAt > new Date() ? e.value : undefined;
  }
  async cacheSet(key: string, value: unknown, ttlSeconds: number) {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const v = (value ?? null) as Prisma.InputJsonValue;
    await this.db.cacheEntry.upsert({ where: { key }, create: { key, value: v, expiresAt }, update: { value: v, expiresAt } });
  }
  async putArtifact(analysisId: string, index: number, kind: ArtifactKind, a: Artifact) {
    const data = new Uint8Array(a.data);
    await this.db.imageArtifact.upsert({
      where: { analysisId_index_kind: { analysisId, index, kind } },
      create: { analysisId, index, kind, mime: a.mime, data },
      update: { mime: a.mime, data },
    });
  }
  async getArtifact(analysisId: string, index: number, kind: ArtifactKind) {
    const row = await this.db.imageArtifact.findUnique({ where: { analysisId_index_kind: { analysisId, index, kind } } });
    return row ? { mime: row.mime, data: Buffer.from(row.data) } : null;
  }
  async deleteArtifact(analysisId: string, index: number, kind: ArtifactKind) {
    await this.db.imageArtifact.deleteMany({ where: { analysisId, index, kind } });
  }
}

export const store: Store = config.databaseUrl ? new PrismaStore() : new MemoryStore();

/** Memoize a slow lookup in the store for `ttlSeconds`. `null` results are cached too. */
export async function cached<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
  const hit = await store.cacheGet(key);
  if (hit !== undefined) return hit as T;
  const value = await fn();
  await store.cacheSet(key, value, value === null ? Math.min(ttlSeconds, 3600) : ttlSeconds);
  return value;
}

export function toReport(r: AnalysisRecord): Report {
  return {
    id: r.id,
    inputKind: r.inputKind,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    meta: r.meta,
    score: r.score,
    band: r.band,
    coverage: r.coverage,
    topReasons: r.topReasons,
    images: r.images,
    signals: r.signals,
    ...(r.error ? { error: r.error } : {}),
  };
}

export function toHistoryItem(r: AnalysisRecord): HistoryItem {
  return {
    id: r.id,
    inputKind: r.inputKind,
    status: r.status,
    title: r.meta?.title ?? null,
    domain: r.meta?.domain ?? null,
    score: r.score,
    band: r.band,
    createdAt: r.createdAt.toISOString(),
  };
}
