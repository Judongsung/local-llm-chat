import type {
  CompletionChunk,
  CompletionInput,
  CompletionStreamer,
} from "./completionStreamer.ts";
import {
  HTTP_METHODS,
  JSON_HEADERS,
  SSE,
} from "../../shared/constants/http.ts";
import { SERVER_ERROR_MESSAGES } from "../../shared/constants/server.ts";
import type {
  ImageAttachment,
  Message,
} from "../../shared/types/chat.ts";
import type { LlmModelConfig } from "../../shared/types/llm.ts";

const CHAT_COMPLETIONS_PATH = "/chat/completions";
const AUTHORIZATION_SCHEME = "Bearer";
const SSE_DONE_EVENT = "[DONE]";
const TRAILING_SLASHES = /\/+$/;

type OpenAiMessageContent =
  | string
  | Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  >;

export function createOpenAiCompletionStreamer(
  configs: LlmModelConfig[],
  fetchImpl: typeof fetch = fetch,
): CompletionStreamer {
  return (input, signal) => {
    const config = configs.find(({ model }) => model === input.settings.model);
    if (!config) throw new Error(SERVER_ERROR_MESSAGES.missingModelConfig);
    return streamOpenAiCompletion(input, config, signal, fetchImpl);
  };
}

export async function* streamOpenAiCompletion(
  input: CompletionInput,
  config: LlmModelConfig,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): AsyncGenerator<CompletionChunk> {
  const messages = [
    ...(input.settings.systemPrompt.trim()
      ? [{ role: "system", content: input.settings.systemPrompt }]
      : []),
    ...input.history.map(toOpenAiMessage),
    {
      role: "user",
      content: toOpenAiContent(input.prompt, input.attachments),
    },
  ];

  const response = await fetchImpl(
    `${config.baseUrl.replace(TRAILING_SLASHES, "")}${CHAT_COMPLETIONS_PATH}`,
    {
      method: HTTP_METHODS.create,
      headers: {
        ...JSON_HEADERS,
        Authorization: `${AUTHORIZATION_SCHEME} ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: input.settings.temperature,
        top_p: input.settings.topP,
        max_tokens: input.settings.maxTokens,
        ...(input.settings.reasoningEffort === "none"
          ? {}
          : { reasoning_effort: input.settings.reasoningEffort }),
        stream: true,
      }),
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(`LLM API 요청 실패 (${response.status})`);
  }
  if (!response.body) throw new Error(SERVER_ERROR_MESSAGES.missingResponseBody);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;

  while (!done) {
    const result = await reader.read();
    done = result.done;
    buffer += decoder.decode(result.value, { stream: !done });
    const events = buffer.split(SSE.blockSeparator);
    buffer = events.pop() ?? "";

    for (const event of events) {
      const chunks = parseEvent(event);
      if (chunks === null) return;
      for (const chunk of chunks) yield chunk;
    }
  }

  if (buffer.trim()) {
    const chunks = parseEvent(buffer);
    if (chunks) {
      for (const chunk of chunks) yield chunk;
    }
  }
}

function toOpenAiMessage({ role, content }: Message): {
  role: Message["role"];
  content: OpenAiMessageContent;
} {
  return {
    role,
    content,
  };
}

function toOpenAiContent(
  text: string,
  attachments: ImageAttachment[] = [],
): OpenAiMessageContent {
  if (attachments.length === 0) return text;
  return [
    ...(text.trim() ? [{ type: "text" as const, text }] : []),
    ...attachments.map((attachment) => ({
      type: "image_url" as const,
      image_url: { url: attachment.dataUrl },
    })),
  ];
}

function parseEvent(event: string): CompletionChunk[] | null {
  const data = event
    .split(SSE.lineSeparator)
    .filter((line) => line.startsWith(SSE.dataPrefix))
    .map((line) => line.slice(SSE.dataPrefix.length).trimStart())
    .join("\n");
  if (!data) return [];
  if (data.trim() === SSE_DONE_EVENT) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new Error(SERVER_ERROR_MESSAGES.invalidStream);
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.choices)) return [];
  const choice = parsed.choices[0];
  if (!isRecord(choice) || !isRecord(choice.delta)) return [];

  const chunks: CompletionChunk[] = [];
  if (typeof choice.delta.reasoning === "string") {
    chunks.push({ type: "reasoning", text: choice.delta.reasoning });
  }
  if (typeof choice.delta.content === "string") {
    chunks.push({ type: "content", text: choice.delta.content });
  }
  return chunks;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
