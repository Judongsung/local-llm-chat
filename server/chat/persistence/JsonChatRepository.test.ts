import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ChatSettings } from "../../../shared/types/chat.ts";
import { JsonChatRepository } from "./JsonChatRepository.ts";

const defaults: ChatSettings = {
  model: "test-model",
  systemPrompt: "",
  temperature: 0.7,
  topP: 1,
  maxTokens: 256,
  reasoningEffort: "none",
};

test("프로필 기본값과 채팅별 오버라이드를 분리해 보존한다", async () => {
  const directory = await mkdtemp(join(tmpdir(), "llm-chat-store-"));
  try {
    const repository = new JsonChatRepository(directory, defaults);
    await repository.load();
    const baseProfile = repository.listProfiles().profiles[0];
    const chat = await repository.create();
    const now = new Date().toISOString();
    const saved = await repository.appendTurn(
      chat.id,
      {
        id: "user-1",
        role: "user",
        content: "첫 번째 질문입니다",
        createdAt: now,
        status: "complete",
      },
      {
        id: "assistant-1",
        role: "assistant",
        content: "첫 번째 답변입니다",
        reasoning: "첫 번째 답변을 검토했습니다",
        createdAt: now,
        status: "complete",
      },
    );

    assert.equal(saved?.title, "첫 번째 질문입니다");
    assert.deepEqual(await readdir(join(directory, "chats")), [
      `${chat.id}.json`,
    ]);
    const storedChat = JSON.parse(
      await readFile(
        join(directory, "chats", `${chat.id}.json`),
        "utf8",
      ),
    );
    assert.equal(storedChat.chat.settings, undefined);
    assert.equal(storedChat.chat.profileId, baseProfile.id);
    assert.deepEqual(storedChat.chat.settingsOverrides, {});

    const reloaded = new JsonChatRepository(directory, defaults);
    await reloaded.load();
    assert.equal(reloaded.get(chat.id)?.messages.length, 2);
    assert.equal(
      reloaded.get(chat.id)?.messages[1].reasoning,
      "첫 번째 답변을 검토했습니다",
    );

    const profile = await reloaded.createProfile("정밀", {
      ...defaults,
      systemPrompt: "정밀하게 답변",
      temperature: 1.25,
    });
    await reloaded.selectProfile(chat.id, profile.id);
    await reloaded.updateChatParameters(chat.id, {
      model: defaults.model,
      temperature: 1.5,
      topP: defaults.topP,
      maxTokens: defaults.maxTokens,
      reasoningEffort: defaults.reasoningEffort,
    });
    assert.equal(reloaded.get(chat.id)?.settings.temperature, 1.5);
    assert.equal(
      reloaded.get(chat.id)?.settings.systemPrompt,
      "정밀하게 답변",
    );

    const restarted = new JsonChatRepository(directory, defaults);
    await restarted.load();
    assert.equal(restarted.get(chat.id)?.profileId, profile.id);
    assert.equal(restarted.get(chat.id)?.settings.temperature, 1.5);
    assert.equal(restarted.get(chat.id)?.messages.length, 2);

    await restarted.updateProfile(profile.id, "정밀", {
      ...profile.settings,
      systemPrompt: "변경된 프롬프트",
      temperature: 0.5,
    });
    assert.equal(restarted.get(chat.id)?.settings.temperature, 1.5);
    assert.equal(
      restarted.get(chat.id)?.settings.systemPrompt,
      "변경된 프롬프트",
    );

    const second = await restarted.create();
    assert.equal(second.profileId, profile.id);
    await restarted.deleteProfile(profile.id);
    assert.equal(restarted.get(chat.id)?.profileId, baseProfile.id);
    assert.equal(restarted.get(chat.id)?.profileFallback, true);
    assert.equal(restarted.get(chat.id)?.settings.temperature, 0.7);
    assert.equal(await restarted.deleteProfile(baseProfile.id), null);

    await writeFile(join(directory, "profiles.json"), '{"version":2}', "utf8");
    await assert.rejects(
      new JsonChatRepository(directory, defaults).load(),
      /저장 파일 형식/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("사용자 프롬프트를 수정하고 해당 응답과 함께 삭제한다", async () => {
  const directory = await mkdtemp(join(tmpdir(), "llm-chat-store-"));
  try {
    const repository = new JsonChatRepository(directory, defaults);
    await repository.load();
    const chat = await repository.create();
    const now = new Date().toISOString();
    await repository.appendTurn(
      chat.id,
      {
        id: "user-1",
        role: "user",
        content: "첫 질문",
        createdAt: now,
        status: "complete",
      },
      {
        id: "assistant-1",
        role: "assistant",
        content: "첫 답변",
        createdAt: now,
        status: "complete",
      },
    );
    await repository.appendTurn(
      chat.id,
      {
        id: "user-2",
        role: "user",
        content: "둘째 질문",
        createdAt: now,
        status: "complete",
      },
      {
        id: "assistant-2",
        role: "assistant",
        content: "둘째 답변",
        createdAt: now,
        status: "complete",
      },
    );

    const edited = await repository.updateUserMessage(
      chat.id,
      "user-1",
      "수정한 첫 질문",
    );
    assert.equal(edited?.messages[0].content, "수정한 첫 질문");
    assert.equal(edited?.title, "수정한 첫 질문");
    assert.equal(
      await repository.updateUserMessage(
        chat.id,
        "assistant-1",
        "수정 시도",
      ),
      null,
    );

    const afterDelete = await repository.deleteTurn(chat.id, "user-1");
    assert.deepEqual(
      afterDelete?.messages.map(({ id }) => id),
      ["user-2", "assistant-2"],
    );
    assert.equal(afterDelete?.title, "둘째 질문");

    const reloaded = new JsonChatRepository(directory, defaults);
    await reloaded.load();
    assert.deepEqual(
      reloaded.get(chat.id)?.messages.map(({ id }) => id),
      ["user-2", "assistant-2"],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
