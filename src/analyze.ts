/**
 * analyze(options): units → candidates → judgment → findings, the whole pipeline in one call.
 */
import { resolve } from "node:path";
import {
  embeddingNeighbors,
  findCandidates,
  OpenAICompatibleEmbedder,
  type CandidateOptions,
  type CandidateResult,
} from "./candidates/index.js";
import { loadConfig, type ParalogConfig } from "./config.js";
import { extractUnits, type Extraction } from "./extract.js";
import { createProvider, judge, type AIProvider, type JudgeResult } from "./judge/index.js";

export interface AnalyzeOptions {
  readonly root: string;
  /** Defaults to `paralog.config.json` in the root. */
  readonly config?: ParalogConfig;
  /** Reuse and update `.paralog/cache/`. Default false. */
  readonly cache?: boolean;
  /** Overrides `config.ai`; tests pass a fake provider here. */
  readonly provider?: AIProvider;
  /** Plan and estimate the judgment without sending anything to a model. */
  readonly dryRun?: boolean;
  readonly maxPairs?: number;
  readonly budget?: number;
  readonly candidates?: CandidateOptions;
}

export interface Analysis {
  readonly extraction: Extraction;
  readonly candidates: CandidateResult;
  readonly judgment: JudgeResult;
}

export async function analyze(options: AnalyzeOptions): Promise<Analysis> {
  const root = resolve(options.root);
  const config = options.config ?? loadConfig(root);
  const cache = options.cache === true;
  const extraction = extractUnits({ root, config, cache });

  let similarities: Map<string, number> | undefined;
  if (config.embeddings !== undefined && options.dryRun !== true) {
    similarities = await embeddingNeighbors(extraction.units, {
      root,
      embedder: new OpenAICompatibleEmbedder(config.embeddings),
      cache,
      ...(config.embeddings.neighbors === undefined ? {} : { neighbors: config.embeddings.neighbors }),
    });
  }
  const candidates = findCandidates(extraction.units, {
    ...options.candidates,
    ...(similarities === undefined ? {} : { similarities }),
  });

  const provider = options.provider ?? (config.ai === undefined || options.dryRun === true ? undefined : createProvider(config.ai));
  const judgment = await judge({
    root,
    units: extraction.units,
    types: extraction.types,
    candidates: candidates.candidates,
    cache,
    ...(provider === undefined ? {} : { provider }),
    ...(options.dryRun === undefined ? {} : { dryRun: options.dryRun }),
    ...(options.maxPairs === undefined ? {} : { maxPairs: options.maxPairs }),
    ...(options.budget === undefined ? {} : { budget: options.budget }),
    ...(config.ai?.concurrency === undefined ? {} : { concurrency: config.ai.concurrency }),
  });
  return { extraction, candidates, judgment };
}
