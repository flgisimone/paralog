/**
 * Optional embeddings (F3-04): off unless configured. Each unit's source is embedded once per
 * body hash; the nearest neighbours of every unit are added to the compared pairs, with their
 * cosine similarity as the `embedding` signal.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { CACHE_DIR } from "../cache.js";
import type { EmbeddingsConfig } from "../config.js";
import type { CodeUnit } from "../extract.js";

export interface Embedder {
  /** Identifies the model in the cache, e.g. `openai-compatible:nomic-embed-text`. */
  readonly id: string;
  embed(texts: readonly string[]): Promise<number[][]>;
}

export class EmbeddingError extends Error {
  override readonly name = "EmbeddingError";
}

const BATCH_SIZE = 32;

/** Embeddings through any API that implements OpenAI's `POST /embeddings` (OpenAI, Ollama, vLLM, OpenRouter). */
export class OpenAICompatibleEmbedder implements Embedder {
  readonly id: string;
  private readonly apiKey: string | undefined;

  constructor(
    private readonly config: EmbeddingsConfig,
    env: Readonly<Record<string, string | undefined>> = process.env,
  ) {
    this.id = `openai-compatible:${config.model}`;
    if (config.apiKeyEnv !== undefined) {
      this.apiKey = env[config.apiKeyEnv];
      if (this.apiKey === undefined || this.apiKey === "") {
        throw new EmbeddingError(`environment variable ${config.apiKeyEnv} is not set`);
      }
    }
  }

  async embed(texts: readonly string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    const url = `${this.config.baseUrl.replace(/\/+$/, "")}/embeddings`;
    for (let start = 0; start < texts.length; start += BATCH_SIZE) {
      const input = texts.slice(start, start + BATCH_SIZE);
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (this.apiKey !== undefined) headers.authorization = `Bearer ${this.apiKey}`;
      let response: Response;
      try {
        response = await fetch(url, { method: "POST", headers, body: JSON.stringify({ model: this.config.model, input }) });
      } catch (error) {
        throw new EmbeddingError(`cannot reach ${url}: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (!response.ok) throw new EmbeddingError(`${url} answered ${String(response.status)} ${response.statusText}`);
      const body = (await response.json()) as { data?: { embedding?: unknown; index?: number }[] };
      const data = [...(body.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      if (data.length !== input.length || !data.every((d) => Array.isArray(d.embedding))) {
        throw new EmbeddingError(`${url} returned ${String(data.length)} embeddings for ${String(input.length)} inputs`);
      }
      for (const d of data) vectors.push((d.embedding as unknown[]).map(Number));
    }
    return vectors;
  }
}

/** Source text of a unit, as embedded. */
export function unitSource(root: string, unit: CodeUnit): string {
  const lines = readFileSync(resolve(root, unit.file), "utf8").split("\n");
  return lines.slice(unit.startLine - 1, unit.endLine).join("\n");
}

class EmbeddingCache {
  private readonly path: string;
  private readonly vectors = new Map<string, number[]>();

  constructor(root: string, embedderId: string) {
    const name = createHash("sha256").update(embedderId).digest("hex").slice(0, 16);
    this.path = join(root, CACHE_DIR, `embeddings-${name}.json`);
    if (!existsSync(this.path)) return;
    try {
      const data = JSON.parse(readFileSync(this.path, "utf8")) as Record<string, number[]>;
      for (const [hash, vector] of Object.entries(data)) this.vectors.set(hash, vector);
    } catch {
      // Rebuilt below.
    }
  }

  get(hash: string): number[] | undefined {
    return this.vectors.get(hash);
  }

  set(hash: string, vector: number[]): void {
    this.vectors.set(hash, vector);
  }

  save(keep: ReadonlySet<string>): void {
    const data = Object.fromEntries([...this.vectors].filter(([hash]) => keep.has(hash)).sort(([a], [b]) => (a < b ? -1 : 1)));
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${String(process.pid)}.tmp`;
    writeFileSync(temporary, JSON.stringify(data));
    renameSync(temporary, this.path);
  }
}

function normalize(vector: readonly number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
  return norm === 0 ? [...vector] : vector.map((x) => x / norm);
}

/** Key of an unordered pair of unit ids. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export interface NeighborOptions {
  readonly root: string;
  readonly embedder: Embedder;
  readonly neighbors?: number;
  /** Reuse and update `.paralog/cache/embeddings-*.json`. Default false. */
  readonly cache?: boolean;
}

/** Cosine similarity of every unit with its nearest neighbours, keyed by `pairKey`. */
export async function embeddingNeighbors(units: readonly CodeUnit[], options: NeighborOptions): Promise<Map<string, number>> {
  const k = options.neighbors ?? 5;
  const cache = options.cache === true ? new EmbeddingCache(options.root, options.embedder.id) : undefined;
  const missing = units.filter((u) => cache?.get(u.bodyHash) === undefined);
  const uniqueMissing = [...new Map(missing.map((u) => [u.bodyHash, u])).values()];
  const fresh = uniqueMissing.length === 0 ? [] : await options.embedder.embed(uniqueMissing.map((u) => unitSource(options.root, u)));
  const byHash = new Map<string, number[]>();
  uniqueMissing.forEach((u, i) => {
    const vector = fresh[i] ?? [];
    byHash.set(u.bodyHash, vector);
    cache?.set(u.bodyHash, vector);
  });
  const vectors = units.map((u) => normalize(byHash.get(u.bodyHash) ?? cache?.get(u.bodyHash) ?? []));
  cache?.save(new Set(units.map((u) => u.bodyHash)));

  const similarities = new Map<string, number>();
  units.forEach((unit, i) => {
    const vi = vectors[i] ?? [];
    const scored: { j: number; cosine: number }[] = [];
    units.forEach((other, j) => {
      if (i === j || other.bodyHash === unit.bodyHash) return;
      const vj = vectors[j] ?? [];
      let dot = 0;
      for (let d = 0; d < vi.length; d++) dot += (vi[d] ?? 0) * (vj[d] ?? 0);
      scored.push({ j, cosine: dot });
    });
    scored.sort((a, b) => b.cosine - a.cosine || a.j - b.j);
    for (const { j, cosine } of scored.slice(0, k)) {
      const other = units[j];
      if (other !== undefined) similarities.set(pairKey(unit.id, other.id), Math.max(0, Math.min(1, cosine)));
    }
  });
  return similarities;
}
