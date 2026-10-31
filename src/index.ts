/**
 * paralog — library entry point.
 *
 * `analyze(options)` arrives with F3–F4; see plan/README.md.
 */
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
  type Extraction,
  type UnitKind,
} from "./extract.js";
