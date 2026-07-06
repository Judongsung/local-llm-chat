import assert from "node:assert/strict";
import test from "node:test";
import type { ChatSettings } from "../../shared/types/chat.ts";
import { createOpenAiCompletionStreamer } from "./openAiCompletionStreamer.ts";

const settings: ChatSettings = {
  model: "test-model",
  systemPrompt: "",
  temperature: 0.7,
  topP: 1,
  maxTokens: 256,
  reasoningEffort: "high",
};

test("OpenAI 호환 스트림을 읽고 키를 Authorization 헤더에만 넣는다", async () => {
  let capturedUrl = "";
  let captured: RequestInit | undefined;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          'data: {"choices":[{"delta":{"reasoning":"인사말 검토"}}]}\n\n' +
            'data: {"choices":[{"delta":{"content":"안',
        ),
      );
      controller.enqueue(
        encoder.encode('녕"}}]}\n\ndata: {"choices":[{"delta":{"content":"!"}}]}\n\n'),
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  const fakeFetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    capturedUrl = String(input);
    captured = init;
    return new Response(body, { status: 200 });
  }) as typeof fetch;

  const deltas = [];
  const streamer = createOpenAiCompletionStreamer(
    [
      {
        apiKey: "unused-secret",
        baseUrl: "https://unused.test/v1",
        model: "unused-model",
      },
      {
        apiKey: "server-secret",
        baseUrl: "https://example.test/v1/",
        model: "test-model",
      },
    ],
    fakeFetch,
  );
  for await (const delta of streamer(
    {
      history: [
        {
          id: "assistant-1",
          role: "assistant",
          content: "이전 답변",
          reasoning: "저장된 추론",
          createdAt: "2026-01-01T00:00:00.000Z",
          status: "complete",
        },
      ],
      prompt: "인사",
      settings,
    },
    new AbortController().signal,
  )) {
    deltas.push(delta);
  }

  assert.deepEqual(deltas, [
    { type: "reasoning", text: "인사말 검토" },
    { type: "content", text: "안녕" },
    { type: "content", text: "!" },
  ]);
  assert.equal(capturedUrl, "https://example.test/v1/chat/completions");
  assert.equal(
    (captured?.headers as Record<string, string>).Authorization,
    "Bearer server-secret",
  );
  assert.doesNotMatch(String(captured?.body), /server-secret/);
  const requestBody = JSON.parse(String(captured?.body));
  assert.equal(requestBody.reasoning_effort, "high");
  assert.deepEqual(requestBody.messages[0], {
    role: "assistant",
    content: "이전 답변",
  });
});
