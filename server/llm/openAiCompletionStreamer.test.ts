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
          id: "user-1",
          role: "user",
          content: "이전 이미지",
          attachments: [
            {
              id: "old-image",
              name: "old.jpg",
              mimeType: "image/jpeg",
              dataUrl: "data:image/jpeg;base64,b2xk",
              size: 3,
            },
          ],
          createdAt: "2026-01-01T00:00:00.000Z",
          status: "complete",
        },
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
      attachments: [],
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
    role: "user",
    content: "이전 이미지",
  });
  assert.deepEqual(requestBody.messages[1], {
    role: "assistant",
    content: "이전 답변",
  });
  assert.doesNotMatch(String(captured?.body), /data:image\/jpeg/);
});

test("이미지 첨부를 OpenAI 호환 content part로 보낸다", async () => {
  let captured: RequestInit | undefined;
  const encoder = new TextEncoder();
  const fakeFetch = (async (_input: URL | RequestInfo, init?: RequestInit) => {
    captured = init;
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'),
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  const streamer = createOpenAiCompletionStreamer(
    [{ apiKey: "key", baseUrl: "https://example.test/v1", model: "test-model" }],
    fakeFetch,
  );
  for await (const _delta of streamer(
    {
      history: [],
      prompt: "이 이미지 설명해줘",
      attachments: [
        {
          id: "image-1",
          name: "test.png",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,aGVsbG8=",
          size: 5,
        },
      ],
      settings,
    },
    new AbortController().signal,
  )) {
    // 스트림을 끝까지 소비한다.
  }

  const requestBody = JSON.parse(String(captured?.body));
  assert.deepEqual(requestBody.messages.at(-1), {
    role: "user",
    content: [
      { type: "text", text: "이 이미지 설명해줘" },
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,aGVsbG8=" },
      },
    ],
  });
});
