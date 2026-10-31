/**
 * paralog — library entry point.
 *
 * `analyze(options)` runs the whole pipeline: units → candidates → judgment → findings.
 */
export { analyze, type AnalyzeOptions, type Analysis } from "./analyze.js";
export { VERSION } from "./version.js";
export {
  CONFIG_FILE,
  ConfigError,
  DEFAULT_CONFIG,
  DEFAULT_EXCLUDES,
  loadConfig,
  parseConfig,
  type ParalogConfig,
} from "./config.js";
export { discoverProjects, type DiscoveredProject, type Discovery } from "./discovery.js";
export {
  EXTRACTOR_VERSION,
  extractUnits,
  type CodeUnit,
  type ExtractOptions,
  type TypeDeclaration,
  type Extraction,
  type UnitKind,
} from "./extract.js";
export {
  DEFAULT_WEIGHTS,
  EMBEDDING_WEIGHTS,
  findCandidates,
  type Candidate,
  type CandidateOptions,
  type CandidateResult,
  type Signals,
} from "./candidates/index.js";
export {
  AnthropicProvider,
  buildFindings,
  checkEvidence,
  createProvider,
  judge,
  NoProviderError,
  OpenAICompatibleProvider,
  PROMPT_VERSION,
  type AIConfig,
  type AIProvider,
  type Finding,
  type FindingStatus,
  type JudgeResult,
  type Verdict,
} from "./judge/index.js";
