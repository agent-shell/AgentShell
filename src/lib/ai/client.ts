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
    try {
      const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          stream: true,
          tools: tools.map((t) => ({
            type: "function",
            function: { name: t.name, description: t.description, parameters: t.input_schema },
          })),
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!resp.ok || !resp.body) {
        yield { type: "error", error: `OpenAI-compat error: ${resp.status} ${resp.statusText}` };
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
