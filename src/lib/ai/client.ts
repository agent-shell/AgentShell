import Anthropic from "@anthropic-ai/sdk";

export type AIBackend =
  | { type: "claude"; apiKey: string; model: string }
  | { type: "ollama"; baseUrl: string; model: string }
  | { type: "openai-compat"; baseUrl: string; apiKey: string; model: string };

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface Delta {
  type: "text" | "tool_use" | "error" | "done";
  text?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  error?: string;
}

export interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export const PROPOSE_COMMAND_TOOL: Tool = {
  name: "propose_command",
  description: "Propose a terminal command for user approval before execution",
  input_schema: {
    type: "object",
    properties: {
      command: { type: "string", description: "The shell command to execute" },
      explanation: { type: "string", description: "Why this command is needed" },
      risk_level: { type: "string", enum: ["safe", "caution", "destructive"] },
    },
    required: ["command", "explanation", "risk_level"],
  },
};

export interface AISettings {
  backend: AIBackend["type"];
  claudeApiKey?: string;
  claudeModel?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  openaiCompatBaseUrl?: string;
  openaiCompatApiKey?: string;
  openaiCompatModel?: string;
  executionMode?: "manual" | "auto";
}

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function buildOpenAICompatEndpoint(baseUrl: string): string {
  const normalized = trimTrailingSlash(baseUrl);
  if (!normalized) return "";
  if (/\/chat\/completions$/i.test(normalized)) return normalized;
  if (/\/v\d+$/i.test(normalized)) return `${normalized}/chat/completions`;
  return `${normalized}/v1/chat/completions`;
}

function buildOpenAICompatPayload(
  model: string,
  messages: Message[],
  tools: Tool[],
  includeTools: boolean,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model,
    stream: true,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };

  if (includeTools && tools.length) {
    payload.tools = tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));
  }

  return payload;
}

async function readResponseText(resp: Response): Promise<string> {
  try {
    return (await resp.text()).trim();
  } catch {
    return "";
  }
}

function extractOpenAICompatErrorMessage(bodyText: string): string {
  if (!bodyText) return "";
  try {
    const parsed = JSON.parse(bodyText) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // Fall through to raw text.
  }
  return bodyText;
}

function formatOpenAICompatError(resp: Response, bodyText: string): string {
  const details = extractOpenAICompatErrorMessage(bodyText);
  return details
    ? `OpenAI-compat error: ${resp.status} ${resp.statusText} - ${details}`
    : `OpenAI-compat error: ${resp.status} ${resp.statusText}`;
}

function shouldRetryOpenAICompatWithoutTools(resp: Response, bodyText: string): boolean {
  if (![400, 404, 422, 501].includes(resp.status)) return false;
  const haystack = bodyText.toLowerCase();
  const mentionsTools = /tools?|tool_calls?|functions?/.test(haystack);
  const soundsUnsupported =
    /unsupported|not supported|unknown|unrecognized|unexpected|invalid/.test(haystack);
  return mentionsTools && soundsUnsupported;
}

export class AIClient {
  constructor(private backend: AIBackend) {}

  async *chat(messages: Message[], tools: Tool[]): AsyncGenerator<Delta> {
    switch (this.backend.type) {
      case "claude":
        yield* this.chatClaude(messages, tools);
        break;
      case "ollama":
        yield* this.chatOllama(messages, tools);
        break;
      case "openai-compat":
        yield* this.chatOpenAICompat(messages, tools);
        break;
    }
  }

  private async *chatClaude(messages: Message[], tools: Tool[]): AsyncGenerator<Delta> {
    try {
      const client = new Anthropic({
        apiKey: this.backend.type === "claude" ? this.backend.apiKey : "",
        dangerouslyAllowBrowser: true,
      });

      const anthropicTools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as Anthropic.Tool["input_schema"],
      }));

      const stream = client.messages.stream({
        model: this.backend.type === "claude" ? this.backend.model : "claude-sonnet-4-6",
        max_tokens: 4096,
        tools: anthropicTools,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield { type: "text", text: event.delta.text };
        }
      }

      const finalMsg = await stream.finalMessage();
      for (const block of finalMsg.content) {
        if (block.type === "tool_use") {
          yield {
            type: "tool_use",
            tool_name: block.name,
            tool_input: block.input as Record<string, unknown>,
          };
        }
      }

      yield { type: "done" };
    } catch (err) {
      yield {
        type: "error",
        error: err != null && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err),
      };
    }
  }

  private async *chatOllama(messages: Message[], tools: Tool[]): AsyncGenerator<Delta> {
    const baseUrl = this.backend.type === "ollama" ? this.backend.baseUrl : "http://localhost:11434";
    const model = this.backend.type === "ollama" ? this.backend.model : "llama3";
    try {
      const resp = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          tools: tools.map((t) => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: t.input_schema },
          })),
          stream: true,
        }),
      });

      if (!resp.ok || !resp.body) {
        yield { type: "error", error: `Ollama error: ${resp.status} ${resp.statusText}` };
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line) as {
              message?: { content?: string; tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }> };
              done?: boolean;
            };
            if (obj.message?.content) {
              yield { type: "text", text: obj.message.content };
            }
            if (obj.message?.tool_calls) {
              for (const tc of obj.message.tool_calls) {
                yield {
                  type: "tool_use",
                  tool_name: tc.function.name,
                  tool_input: tc.function.arguments,
                };
              }
            }
          } catch {
            // skip malformed NDJSON lines
          }
        }
      }
      yield { type: "done" };
    } catch (err) {
      yield {
        type: "error",
        error: err != null && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err),
      };
    }
  }

  private async *chatOpenAICompat(messages: Message[], tools: Tool[]): AsyncGenerator<Delta> {
    const { baseUrl, apiKey, model } =
      this.backend.type === "openai-compat"
        ? this.backend
        : { baseUrl: "", apiKey: "", model: "gpt-4o" };
    const endpoint = buildOpenAICompatEndpoint(baseUrl);

    if (!endpoint || !apiKey.trim() || !model.trim()) {
      yield {
        type: "error",
        error: "OpenAI-compatible backend requires Base URL, API key, and model.",
      };
      return;
    }

    try {
      let resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(buildOpenAICompatPayload(model, messages, tools, true)),
      });

      if (!resp.ok) {
        const bodyText = await readResponseText(resp);
        if (shouldRetryOpenAICompatWithoutTools(resp, bodyText)) {
          resp = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(buildOpenAICompatPayload(model, messages, tools, false)),
          });
        } else {
          yield { type: "error", error: formatOpenAICompatError(resp, bodyText) };
          return;
        }
      }

      if (!resp.ok) {
        const bodyText = await readResponseText(resp);
        yield { type: "error", error: formatOpenAICompatError(resp, bodyText) };
        return;
      }

      if (!resp.body) {
        yield { type: "error", error: "OpenAI-compat error: empty response body" };
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      // Accumulate partial tool_call arguments
      const toolCallBufs: Record<number, { name: string; argsBuf: string }> = {};

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") { yield { type: "done" }; return; }
          try {
            const obj = JSON.parse(data) as {
              choices?: Array<{
                delta?: {
                  content?: string;
                  tool_calls?: Array<{ index: number; function?: { name?: string; arguments?: string } }>;
                };
              }>;
            };
            const delta = obj.choices?.[0]?.delta;
            if (delta?.content) {
              yield { type: "text", text: delta.content };
            }
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (!toolCallBufs[tc.index]) {
                  toolCallBufs[tc.index] = { name: tc.function?.name ?? "", argsBuf: "" };
                }
                if (tc.function?.name) toolCallBufs[tc.index].name = tc.function.name;
                if (tc.function?.arguments) toolCallBufs[tc.index].argsBuf += tc.function.arguments;
              }
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }

      // Flush accumulated tool calls
      for (const tc of Object.values(toolCallBufs)) {
        try {
          yield {
            type: "tool_use",
            tool_name: tc.name,
            tool_input: JSON.parse(tc.argsBuf) as Record<string, unknown>,
          };
        } catch {
          // ignore malformed tool call
        }
      }
      yield { type: "done" };
    } catch (err) {
      yield {
        type: "error",
        error: err != null && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err),
      };
    }
  }

  static fromSettings(settings: AISettings): AIClient {
    switch (settings.backend) {
      case "claude":
        return new AIClient({
          type: "claude",
          apiKey: settings.claudeApiKey ?? "",
          model: settings.claudeModel ?? "claude-sonnet-4-6",
        });
      case "ollama":
        return new AIClient({
          type: "ollama",
          baseUrl: settings.ollamaBaseUrl ?? "http://localhost:11434",
          model: settings.ollamaModel ?? "llama3",
        });
      case "openai-compat":
        return new AIClient({
          type: "openai-compat",
          baseUrl: settings.openaiCompatBaseUrl ?? "",
          apiKey: settings.openaiCompatApiKey ?? "",
          model: settings.openaiCompatModel ?? "gpt-4o",
        });
    }
  }
}
