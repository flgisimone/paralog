/**
 * AI providers (F4-01). Nothing here runs unless a provider is configured explicitly; API keys
 * are read from environment variables only and never appear in errors or logs.
 */
import Anthropic from "@anthropic-ai/sdk";

export interface GenerateRequest {
  readonly system: string;
  readonly prompt: string;
  /** JSON Schema the output must match (objects with `additionalProperties: false`). */
  readonly schema: Readonly<Record<string, unknown>>;
  readonly maxTokens: number;
}

export interface Usage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface GenerateResult {
  /** Parsed JSON output; validate it before use. */
  readonly output: unknown;
  /** Model that produced the output (a server-side fallback may differ from the requested one). */
  readonly model: string;
  readonly usage: Usage;
}

export interface AIProvider {
  /** Provider and model, e.g. `anthropic:claude-opus-5-5`: part of the verdict cache key. */
  readonly id: string;
  generate(request: GenerateRequest): Promise<GenerateResult>;
}

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AIConfig {
  readonly provider: "anthropic" | "openai-compatible";
  readonly model: string;
  /** Required for `openai-compatible` (e.g. `http://localhost:11434/v1`); optional for `anthropic`. */
  readonly baseUrl?: string;
  /** Environment variable with the API key. Default `ANTHROPIC_API_KEY` for `anthropic`; none for `openai-compatible`. */
  readonly apiKeyEnv?: string;
  /** Pairs judged in parallel. Default 4. */
  readonly concurrency?: number;
  /** Per request. Default 120000. */
  readonly timeoutMs?: number;
  /** Retries on rate limits, server errors and network errors. Default 3. */
  readonly maxRetries?: number;
  /** Anthropic only: reasoning effort. Default `medium`. */
  readonly effort?: Effort;
}

export class ProviderError extends Error {
  override readonly name = "ProviderError";
  constructor(
    message: string,
    /** Retrying the same request may succeed. */
    readonly retryable = false,
  ) {
    super(message);
  }
}

/** The model declined to answer; the pair stays unjudged. */
export class RefusalError extends ProviderError {}

type Env = Readonly<Record<string, string | undefined>>;

function readKey(variable: string, env: Env): string {
  const key = env[variable];
  if (key === undefined || key === "") throw new ProviderError(`environment variable ${variable} is not set`);
  return key;
}

/** Removes a secret from a message, in case an upstream error echoes it. */
function redact(message: string, secret: string | undefined): string {
  return secret === undefined || secret === "" ? message : message.split(secret).join("[redacted]");
}

/** Models that accept the server-side `fallbacks: "default"` parameter on the Claude API. */
const FALLBACK_MODELS = /^claude-(?:opus-5|fable-5-1|mythos-5-1|sonnet-5-5)/;

export class AnthropicProvider implements AIProvider {
  readonly id: string;
  private readonly client: Anthropic;
  private readonly apiKey: string;

  constructor(
    private readonly config: AIConfig,
    env: Env = process.env,
  ) {
    this.id = `anthropic:${config.model}`;
    this.apiKey = readKey(config.apiKeyEnv ?? "ANTHROPIC_API_KEY", env);
    this.client = new Anthropic({
      apiKey: this.apiKey,
      ...(config.baseUrl === undefined ? {} : { baseURL: config.baseUrl }),
      maxRetries: config.maxRetries ?? 3,
      timeout: config.timeoutMs ?? 120_000,
    });
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const fallback = FALLBACK_MODELS.test(this.config.model);
    let response;
    try {
      response = await this.client.beta.messages.create({
        model: this.config.model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
        output_config: { effort: this.config.effort ?? "medium", format: { type: "json_schema", schema: { ...request.schema } } },
        // On a policy decline, the API re-runs the request on a recommended fallback model.
        ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        const retryable = error.status === undefined || error.status === 429 || error.status >= 500;
        throw new ProviderError(redact(`Anthropic API error ${String(error.status)}: ${error.message}`, this.apiKey), retryable);
      }
      throw new ProviderError(redact(`Anthropic request failed: ${String(error)}`, this.apiKey), true);
    }
    if (response.stop_reason === "refusal") throw new RefusalError("the model declined to judge this pair");
    if (response.stop_reason === "max_tokens") throw new ProviderError("the answer was cut at max_tokens");
    const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    return {
      output: parseJson(text),
      model: response.model,
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
    };
  }
}

/** Parses a JSON answer, tolerating a Markdown code fence around it. */
export function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new ProviderError("the answer is not valid JSON");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

/** Any API compatible with OpenAI's `POST /chat/completions` and JSON Schema response formats (Ollama, vLLM, OpenRouter). */
export class OpenAICompatibleProvider implements AIProvider {
  readonly id: string;
  private readonly apiKey: string | undefined;
  private readonly url: string;

  constructor(
    private readonly config: AIConfig,
    env: Env = process.env,
    /** Base delay of the exponential backoff, in milliseconds. */
    private readonly backoffMs = 1000,
  ) {
    if (config.baseUrl === undefined) throw new ProviderError("'ai.baseUrl' is required for the openai-compatible provider");
    this.id = `openai-compatible:${config.model}`;
    this.url = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    this.apiKey = config.apiKeyEnv === undefined ? undefined : readKey(config.apiKeyEnv, env);
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const maxRetries = this.config.maxRetries ?? 3;
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.once(request);
      } catch (error) {
        const retryable = error instanceof ProviderError && error.retryable;
        if (!retryable || attempt >= maxRetries) throw error;
        await sleep(this.backoffMs * 2 ** attempt);
      }
    }
  }

  private async once(request: GenerateRequest): Promise<GenerateResult> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.apiKey !== undefined) headers.authorization = `Bearer ${this.apiKey}`;
    let response: Response;
    try {
      response = await fetch(this.url, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 120_000),
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: request.maxTokens,
          temperature: 0,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.prompt },
          ],
          response_format: { type: "json_schema", json_schema: { name: "verdict", strict: true, schema: request.schema } },
        }),
      });
    } catch (error) {
      throw new ProviderError(redact(`cannot reach ${this.url}: ${error instanceof Error ? error.message : String(error)}`, this.apiKey), true);
    }
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new ProviderError(`${this.url} answered ${String(response.status)} ${response.statusText}`, retryable);
    }
    const body = (await response.json()) as {
      model?: string;
      choices?: { message?: { content?: string; refusal?: string | null }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const choice = body.choices?.[0];
    if (typeof choice?.message?.refusal === "string" && choice.message.refusal !== "") {
      throw new RefusalError("the model declined to judge this pair");
    }
    if (choice?.finish_reason === "length") throw new ProviderError("the answer was cut at max_tokens");
    return {
      output: parseJson(choice?.message?.content ?? ""),
      model: body.model ?? this.config.model,
      usage: { inputTokens: body.usage?.prompt_tokens ?? 0, outputTokens: body.usage?.completion_tokens ?? 0 },
    };
  }
}

export function createProvider(config: AIConfig, env: Env = process.env): AIProvider {
  return config.provider === "anthropic" ? new AnthropicProvider(config, env) : new OpenAICompatibleProvider(config, env);
}

/** Runs `task` on every item with at most `limit` in flight; results keep the input order. */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index] as T, index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}
