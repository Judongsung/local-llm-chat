import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type {
  ChatSettings,
  StreamEvent,
} from "../../shared/types/chat.ts";
import type {
  CompletionInput,
  CompletionStreamer,
} from "../llm/completionStreamer.ts";
import { JsonChatRepository } from "./persistence/JsonChatRepository.ts";
import { ChatService } from "./chatService.ts";
import {
  APPLICATION_ERROR_KIND,
  ApplicationError,
} from "../errors/applicationError.ts";

const defaults: ChatSettings = {
  model: "test-model",
  systemPrompt: "",
  temperature: 0.7,
  topP: 1,
  maxTokens: 256,
  reasoningEffort: "none",
};

test("번역 실패 후 영문을 보존하고 번역만 교체해 재시도한다", async () => {
  const directory = await mkdtemp(join(tmpdir(), "llm-chat-service-"));
  try {
    const repository = new JsonChatRepository(directory, defaults);
    await repository.load();
    const chat = await repository.create("translation");
    const calls: CompletionInput[] = [];
    const streamer: CompletionStreamer = async function* (input) {
      calls.push(structuredClone(input));
      if (calls.length === 1) {
        yield { type: "content", text: "English answer" };
      } else if (calls.length === 2) {
        yield { type: "content", text: "부분 번역" };
        throw new Error("번역 실패");
      } else {
        yield { type: "content", text: "완료된 번역" };
      }
    };
    const service = new ChatService(repository, streamer);

    const failed = await collect(
      service.streamMessage(
        chat.id,
        { content: "질문", attachments: [] },
        new AbortController().signal,
      ),
    );
    const failure = failed.at(-1);
    assert.equal(failure?.type, "error");
    assert.equal(failure?.type === "error" ? failure.stage : undefined, "translation");
    const afterFailure = repository.get(chat.id);
    if (afterFailure?.mode !== "translation") {
      assert.fail("번역 채팅이 필요합니다.");
    }
    const englishId = afterFailure.stages.generation.messages[1].id;
    assert.equal(afterFailure.stages.generation.messages[1].content, "English answer");
    assert.equal(afterFailure.stages.translation.messages[1].status, "error");

    const retried = await collect(
      service.retryTranslation(
        chat.id,
        englishId,
        new AbortController().signal,
      ),
    );
    assert.equal(retried.at(-1)?.type, "done");
    const completed = repository.get(chat.id);
    if (completed?.mode !== "translation") {
      assert.fail("번역 채팅이 필요합니다.");
    }
    assert.equal(completed.stages.generation.messages.length, 2);
    assert.equal(completed.stages.translation.messages.length, 2);
    assert.equal(completed.stages.translation.messages[1].content, "완료된 번역");
    assert.equal(completed.stages.translation.messages[1].status, "complete");
    assert.deepEqual(calls[2].history, []);
    assert.throws(
      () =>
        service.retryTranslation(
          chat.id,
          englishId,
          new AbortController().signal,
        ),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.kind === APPLICATION_ERROR_KIND.conflict,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("영문 생성이 부분 실패하면 번역 단계를 실행하지 않는다", async () => {
  const directory = await mkdtemp(join(tmpdir(), "llm-chat-service-"));
  try {
    const repository = new JsonChatRepository(directory, defaults);
    await repository.load();
    const chat = await repository.create("translation");
    let calls = 0;
    const service = new ChatService(repository, async function* () {
      calls += 1;
      yield { type: "content", text: "Partial English" };
      throw new Error("생성 실패");
    });

    await collect(
      service.streamMessage(
        chat.id,
        { content: "질문", attachments: [] },
        new AbortController().signal,
      ),
    );
    const saved = repository.get(chat.id);
    if (saved?.mode !== "translation") assert.fail("번역 채팅이 필요합니다.");
    assert.equal(calls, 1);
    assert.equal(saved.stages.generation.messages[1].status, "error");
    assert.deepEqual(saved.stages.translation.messages, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

async function collect(events: AsyncIterable<StreamEvent>) {
  const collected: StreamEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}
