/**
 * GrokProvider — the NATIVE xAI transport behind the {@link LLMProvider} seam.
 *
 * Unlike {@link OpenAICompatibleProvider} (which drives GPT-5.5 through the
 * Chat Completions shim), this adapter speaks xAI's first-class **Responses
 * API** (`client.responses.create`) directly. The OpenAI Node SDK already in
 * the repo is the transport — pointed at `XAI_BASE_URL` it exposes
 * `responses.create` and the full typed Responses event stream — so no new
 * dependency is needed.
 *
 * Differences from the Chat Completions shim:
 *  - System text rides on the top-level `instructions` field (not a system
 *    message); segments are joined with "\n\n". There is NO `cache_control` — xAI
 *    caches a stable prefix automatically (the `cacheBreakpoint` flag is ignored,
 *    same as the shim).
 *  - Tools use the Responses **flattened** function shape
 *    `{ type:"function", name, description, parameters, strict }` — NOT Chat
 *    Completions' nested `{ type:"function", function:{...} }`. `strict:false` lets
 *    the OakAnswer schema's optional/default fields through (xAI applies its own
 *    lenient-strict validation; the loop's Zod re-emit budget is the safety net).
 *  - Reasoning is requested explicitly as `reasoning:{ effort:"high" }` — grok-4.3
 *    defaults to "low", which is too shallow for battle-math. `parallel_tool_calls`
 *    is disabled so `submit_answer` can't ride alongside a data tool, and
 *    `max_output_tokens` is raised so a full candidate list can't truncate the
 *    submit_answer JSON.
 *  - Mid-turn tool loop is STATEFUL by default (`store:true` +
 *    `previous_response_id`): the first iteration of a provider instance sends the
 *    full transcript; later iterations send only new client items
 *    (`function_call_output` + user nudges) so reasoning is not re-paid every
 *    tool round. Set `stateful:false` to force full-transcript re-echo. A chain
 *    failure falls back once to a full resend.
 *  - The streamed Responses events are mapped to the SAME normalized
 *    {@link ProviderStreamEvent} vocabulary the loop already consumes; the
 *    submit_answer argument fragments feed the runtime AnswerMarkdownExtractor
 *    exactly like the other adapters. (xAI tends to deliver a tool call's arguments
 *    in one shot — the `function_call_arguments.done` fallback covers that.)
 */

import OpenAI from "openai";

import { MAX_TOKENS } from "@/agent/providers/constants";
import { ProviderTransportError } from "@/agent/providers/errors";
import type {
  FinalTurn,
  LLMProvider,
  NormalizedToolCall,
  NormalizedUsage,
  ProviderMessage,
  ProviderStream,
  ProviderStreamEvent,
  ProviderTranscript,
  ReasoningEffort,
  ToolResult,
  TurnRequest,
} from "@/agent/providers/types";
import type { ProviderKind } from "@/agent/models";
import type { ChatMessage, ImageAttachment } from "@/agent/types";
import { logger } from "@/server/logger";

type RInputItem = OpenAI.Responses.ResponseInputItem;
type RInputContent = OpenAI.Responses.ResponseInputContent;
type RStreamEvent = OpenAI.Responses.ResponseStreamEvent;
type RResponse = OpenAI.Responses.Response;
type RUsage = OpenAI.Responses.ResponseUsage;
type RTool = OpenAI.Responses.Tool;
type RFunctionCall = OpenAI.Responses.ResponseFunctionToolCall;
type RFunctionCallOutput = OpenAI.Responses.ResponseInputItem.FunctionCallOutput;
type REasyMessage = OpenAI.Responses.EasyInputMessage;

export interface GrokProviderConfig {
  /** The concrete API model id (e.g. "grok-4.3"). */
  apiModelId: string;
  /** API key for the upstream (already validated as present by the factory). */
  apiKey: string;
  /** Base URL override (xAI: https://api.x.ai/v1). */
  baseURL?: string;
  /** Reasoning effort; mapped to `reasoning.effort`. Defaults to "high" (grok
   *  defaults to "low"). */
  effort?: ReasoningEffort;
  /** Sampling temperature. Omit to inherit the provider default (0.7 on Grok 4.3
   *  — too random for battle-math, so the factory pins a low value). */
  temperature?: number;
  /** Output-token budget (`max_output_tokens`); defaults to {@link MAX_TOKENS}. */
  maxOutputTokens?: number;
  /** Allow parallel tool calls. Defaults to false so submit_answer can't be
   *  returned alongside a data tool. */
  parallelToolCalls?: boolean;
  /** Echo the model's reasoning items back across tool turns when using the
   *  full-transcript (non-chain) path. Default true; chain deltas never re-send
   *  model output (server already has it). */
  echoReasoning?: boolean;
  /**
   * Mid-turn Responses chaining via `previous_response_id` + `store:true`.
   * Default true. Set false to force full-transcript re-send every iteration.
   */
  stateful?: boolean;
}

/** Minimal surface of the OpenAI client the Grok provider uses (injectable for tests). */
export interface GrokResponsesClientLike {
  responses: {
    create(
      body: OpenAI.Responses.ResponseCreateParamsStreaming,
      options?: { signal?: AbortSignal },
    ): Promise<AsyncIterable<RStreamEvent>> | AsyncIterable<RStreamEvent>;
  };
}

// ---------------------------------------------------------------------------
// Client memoization (B4) — same idea as Anthropic's getAnthropicClient.
// ---------------------------------------------------------------------------

const clientCache = new Map<string, GrokResponsesClientLike>();

/** Build or reuse an OpenAI SDK client for (apiKey, baseURL). Exported for tests. */
export function getGrokClient(
  apiKey: string,
  baseURL?: string,
): GrokResponsesClientLike {
  const key = `${apiKey}\0${baseURL ?? ""}`;
  let client = clientCache.get(key);
  if (!client) {
    client = new OpenAI({ apiKey, baseURL }) as GrokResponsesClientLike;
    clientCache.set(key, client);
  }
  return client;
}

/** Test-only: clear the memoized client map. */
export function clearGrokClientCacheForTests(): void {
  clientCache.clear();
}

export class GrokProvider implements LLMProvider {
  readonly kind: ProviderKind = "xai";
  readonly apiModelId: string;
  private readonly effort: ReasoningEffort;
  private readonly temperature?: number;
  private readonly maxOutputTokens: number;
  private readonly parallelToolCalls: boolean;
  private readonly echoReasoning: boolean;
  private readonly stateful: boolean;
  private readonly client: GrokResponsesClientLike;

  /**
   * Mid-turn chain state for ONE runOak turn (one provider instance). Cleared
   * only on chain fallback or when stateful is false.
   */
  private lastResponseId: string | null = null;
  /** How many flattened transcript items the last successful request covered. */
  private sentItemCount = 0;

  constructor(config: GrokProviderConfig, client?: GrokResponsesClientLike) {
    this.apiModelId = config.apiModelId;
    this.effort = config.effort ?? "high";
    this.temperature = config.temperature;
    this.maxOutputTokens = config.maxOutputTokens ?? MAX_TOKENS;
    this.parallelToolCalls = config.parallelToolCalls ?? false;
    this.echoReasoning = config.echoReasoning ?? true;
    this.stateful = config.stateful ?? true;
    this.client = client ?? getGrokClient(config.apiKey, config.baseURL);
  }

  createTranscript(
    history: ChatMessage[],
    message: string,
    images?: ImageAttachment[],
  ): ProviderTranscript {
    // System text rides on `instructions`, not the transcript.
    const items: RInputItem[] = [
      ...history.map(
        (turn): REasyMessage => ({ role: turn.role, content: turn.content }),
      ),
      {
        role: "user",
        content: buildUserContent(message, images),
      } satisfies REasyMessage,
    ];
    return items;
  }

  streamTurn(req: TurnRequest): ProviderStream {
    return this.openStream(req, /* allowChain */ this.stateful);
  }

  /**
   * Open one streaming turn. When `allowChain` and we already have a response
   * id, send only continuation items under `previous_response_id`. On a
   * recoverable chain error, fall back once to a full-transcript resend.
   */
  private openStream(req: TurnRequest, allowChain: boolean): ProviderStream {
    const instructions = req.system.map((seg) => seg.text).join("\n\n");
    const tools: RTool[] = req.tools.map((tool) => ({
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as Record<string, unknown>,
      strict: false,
    }));

    const flat = flattenTranscript(req.transcript, this.echoReasoning);
    const useChain = Boolean(allowChain && this.lastResponseId);
    const input = useChain
      ? flat.slice(this.sentItemCount).filter(isContinuationItem)
      : flat;

    const body = this.buildRequestBody({
      instructions,
      tools,
      input,
      previousResponseId: useChain ? this.lastResponseId : null,
    });
    const created = this.client.responses.create(body, { signal: req.signal });

    let completed: RResponse | null = null;
    let chainFailed = false;
    let fallbackStream: ProviderStream | null = null;

    const primary = adaptGrokStream(created, {
      onCompleted: (response) => {
        completed = response;
      },
    });

    const previousId = this.lastResponseId;
    // Nested stream callbacks need the instance; eslint no-this-alias waived.
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- stream closure
    const provider = this;

    return {
      async *[Symbol.asyncIterator](): AsyncGenerator<ProviderStreamEvent> {
        try {
          for await (const event of primary) {
            yield event;
          }
        } catch (err) {
          if (useChain && isChainRecoverableError(err)) {
            chainFailed = true;
            logger.warn(
              {
                event: "grok_response_chain_fallback",
                previous_response_id: previousId,
                detail: err instanceof Error ? err.message : String(err),
              },
              "grok previous_response_id chain failed; resending full transcript",
            );
            provider.lastResponseId = null;
            provider.sentItemCount = 0;
            fallbackStream = provider.openStream(req, /* allowChain */ false);
            for await (const event of fallbackStream) {
              yield event;
            }
            return;
          }
          throw err;
        }
      },
      async final(): Promise<FinalTurn> {
        if (fallbackStream) {
          return fallbackStream.final();
        }
        const final = await primary.final();
        if (!chainFailed && completed?.id) {
          provider.lastResponseId = completed.id;
          provider.sentItemCount = flat.length;
        }
        return final;
      },
    };
  }

  private buildRequestBody(args: {
    instructions: string;
    tools: RTool[];
    input: RInputItem[];
    previousResponseId: string | null;
  }): OpenAI.Responses.ResponseCreateParamsStreaming {
    return {
      model: this.apiModelId,
      instructions: args.instructions,
      input: args.input,
      tools: args.tools,
      tool_choice: "auto",
      parallel_tool_calls: this.parallelToolCalls,
      max_output_tokens: this.maxOutputTokens,
      reasoning: { effort: this.effort },
      // store:true is required for previous_response_id chaining. When stateful
      // is false we still set store:false so nothing is retained server-side.
      store: this.stateful,
      include: ["reasoning.encrypted_content"],
      stream: true,
      ...(args.previousResponseId
        ? { previous_response_id: args.previousResponseId }
        : {}),
      ...(this.temperature !== undefined
        ? { temperature: this.temperature }
        : {}),
    };
  }

  buildUserMessage(text: string): ProviderMessage {
    return { role: "user", content: text } satisfies REasyMessage;
  }

  buildToolResultMessages(results: ToolResult[]): ProviderMessage[] {
    // One function_call_output per call_id. Responses has no per-output error flag
    // (unlike Anthropic's is_error) — the validation-error text already rides in
    // `output`, exactly like the Chat shim's {role:"tool"} messages.
    return results.map(
      (r): RFunctionCallOutput => ({
        type: "function_call_output",
        call_id: r.toolCallId,
        output: r.content,
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Transcript helpers
// ---------------------------------------------------------------------------

/**
 * Depth-1 flatten of the opaque transcript, optionally dropping reasoning
 * items (echoReasoning:false). Nested arrays are the loop's
 * assistantContentToEcho (whole output[]).
 */
function flattenTranscript(
  transcript: ProviderTranscript,
  echoReasoning: boolean,
): RInputItem[] {
  return (transcript as unknown[])
    .flat()
    .filter(
      (it) =>
        echoReasoning ||
        !(
          it != null &&
          typeof it === "object" &&
          (it as { type?: string }).type === "reasoning"
        ),
    ) as RInputItem[];
}

/**
 * Items the client may send under previous_response_id (tool outputs + user
 * nudges). Model output (reasoning / function_call / message) is already on
 * the server when chaining.
 */
function isContinuationItem(item: RInputItem): boolean {
  if (item == null || typeof item !== "object") return false;
  const rec = item as { type?: string; role?: string };
  if (rec.type === "function_call_output") return true;
  if (rec.role === "user") return true;
  return false;
}

/** Heuristic: previous_response_id missing / invalid / not found. */
function isChainRecoverableError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : String(err);
  const lower = msg.toLowerCase();
  return (
    lower.includes("previous_response") ||
    lower.includes("response_id") ||
    lower.includes("not found") ||
    lower.includes("unknown response")
  );
}

/**
 * Build the CURRENT user message content. Text-only stays a plain string (so the
 * request body is byte-identical to the pre-image path — `instructions` + a
 * string-content message — keeping xAI's automatic prefix cache warm). With
 * images present, emit Responses content parts: the `input_text` part (omitted
 * for an image-only turn) followed by one `input_image` part per attachment,
 * each a base64 `data:` URL. The image rides INSIDE this message's `content`
 * array, so the transcript's depth-1 `.flat()` in streamTurn never disturbs it.
 */
function buildUserContent(
  message: string,
  images?: ImageAttachment[],
): string | RInputContent[] {
  if (!images || images.length === 0) return message;
  const parts: RInputContent[] = [];
  if (message.length > 0) parts.push({ type: "input_text", text: message });
  for (const img of images) {
    parts.push({
      type: "input_image",
      detail: "auto",
      image_url: `data:${img.mimeType};base64,${img.data}`,
    });
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Stream adaptation
// ---------------------------------------------------------------------------

/**
 * Classify a thrown upstream error. An xAI `APIError` (4xx/5xx — bad key,
 * unsupported param, rate limit, model-not-found) becomes a
 * {@link ProviderTransportError} carrying its status so the route can show a
 * model-scoped message; anything else propagates unchanged.
 */
function toTransportError(err: unknown): unknown {
  if (err instanceof OpenAI.APIError) {
    return new ProviderTransportError(
      typeof err.status === "number" ? err.status : undefined,
      err.message,
    );
  }
  return err;
}

/** Best-effort JSON parse; `undefined` on malformed args (loop re-emit handles). */
function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function normalizeUsage(usage: RUsage | undefined): NormalizedUsage {
  if (!usage) {
    return { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, cachedTokens: 0 };
  }
  const details = usage.input_tokens_details as
    | { cached_tokens?: number }
    | undefined;
  return {
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    thinkingTokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
    cachedTokens: details?.cached_tokens ?? 0,
  };
}

/**
 * Adapt the xAI Responses streaming events into a provider-neutral
 * {@link ProviderStream}. Captures the final `response` (output items + usage)
 * from `response.completed` during iteration; `final()` reads it (the loop always
 * drains the stream before calling `final()`).
 */
function adaptGrokStream(
  created: Promise<AsyncIterable<RStreamEvent>> | AsyncIterable<RStreamEvent>,
  hooks?: { onCompleted?: (response: RResponse) => void },
): ProviderStream {
  let completed: RResponse | null = null;
  const started = new Set<number>();
  const sawArgsDelta = new Set<number>();
  const stopped = new Set<number>();

  async function* iterate(): AsyncGenerator<ProviderStreamEvent> {
    let stream: AsyncIterable<RStreamEvent>;
    try {
      stream = await created;
    } catch (err) {
      throw toTransportError(err);
    }
    let it: AsyncIterator<RStreamEvent> | undefined;
    for (;;) {
      let res: IteratorResult<RStreamEvent>;
      try {
        it ??= stream[Symbol.asyncIterator]();
        res = await it.next();
      } catch (err) {
        throw toTransportError(err);
      }
      if (res.done) break;
      const ev = res.value;

      switch (ev.type) {
        case "response.output_item.added": {
          if (ev.item.type === "function_call") {
            started.add(ev.output_index);
            yield {
              type: "tool_call_start",
              index: ev.output_index,
              id: ev.item.call_id,
              name: ev.item.name,
            };
          }
          break;
        }
        case "response.function_call_arguments.delta": {
          sawArgsDelta.add(ev.output_index);
          yield {
            type: "tool_call_args_delta",
            index: ev.output_index,
            argChunk: ev.delta,
          };
          break;
        }
        case "response.function_call_arguments.done": {
          // xAI tends to deliver arguments in one shot: if no incremental delta
          // arrived, emit the whole `arguments` once so the AnswerMarkdownExtractor
          // still streams the answer.
          if (!sawArgsDelta.has(ev.output_index) && ev.arguments.length > 0) {
            yield {
              type: "tool_call_args_delta",
              index: ev.output_index,
              argChunk: ev.arguments,
            };
          }
          stopped.add(ev.output_index);
          yield { type: "tool_call_stop", index: ev.output_index };
          break;
        }
        case "response.output_text.delta": {
          yield { type: "text_delta", text: ev.delta };
          break;
        }
        case "response.reasoning_text.delta":
        case "response.reasoning_summary_text.delta": {
          yield { type: "thinking_delta", text: ev.delta };
          break;
        }
        case "response.completed": {
          completed = ev.response;
          hooks?.onCompleted?.(ev.response);
          break;
        }
        default:
          break;
      }
    }

    // Defensive: emit a stop for any tool call that started but never got a
    // `...arguments.done` (clears the loop's submit-index bookkeeping).
    for (const index of started) {
      if (!stopped.has(index)) yield { type: "tool_call_stop", index };
    }
  }

  return {
    [Symbol.asyncIterator]: iterate,
    async final(): Promise<FinalTurn> {
      const output = completed?.output ?? [];
      const toolCalls: NormalizedToolCall[] = output
        .filter((i): i is RFunctionCall => i.type === "function_call")
        .map((i) => ({
          id: i.call_id, // call_id — what function_call_output references
          name: i.name,
          inputJson: i.arguments,
          input: safeJsonParse(i.arguments),
        }));

      return {
        // The WHOLE output[] (reasoning + message + function_call), echoed
        // for loop compatibility; the chain path ignores re-echoed model items
        // when building the next request input.
        assistantContentToEcho: output,
        toolCalls,
        usage: normalizeUsage(completed?.usage),
      };
    },
  };
}
