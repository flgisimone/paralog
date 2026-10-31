/**
 * paralog/mcp — MCP server entry point.
 *
 * The stdio server with `paralog_check`, `paralog_finding` and `paralog_similar`
 * arrives with F5-04; for now this module only describes the server.
 */
import { VERSION } from "../version.js";

export interface ServerInfo {
  readonly name: string;
  readonly version: string;
}

export const serverInfo: ServerInfo = { name: "paralog", version: VERSION };
