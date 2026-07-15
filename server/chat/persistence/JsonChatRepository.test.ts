import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  DEFAULT_GENERATION_SYSTEM_PROMPT,
  DEFAULT_TRANSLATION_SYSTEM_PROMPT,
} from "../../../shared/constants/chatText.ko.ts";
import type { ChatSettings, Message } from "../../../shared/types/chat.ts";
import { JsonChatRepository } from "./JsonChatRepository.ts";

const defaults: ChatSettings = {
  model: "test-model",
  systemPrompt: "",
  temperature: 0.7,
  topP: 1,
  maxTokens: 256,
  reasoningEffort: "none",
};

test("단계 설정과 채팅별 오버라이드를 분리해 보존한다", async () => {
  const directory = await mkdtemp(join(tmpdir(), "llm-chat-store-"));
  try {
    const repository = new JsonChatRepository(directory, defaults);
    await repository.load();
    const baseProfile = repository.listProfiles().profiles[0];
    const chat = await repository.create();
    await repository.appendTurn(
      chat.id,
      "generation",
      message("user-1", "user", "첫 번째 질문입니다"),
      {
        ...message("assistant-1", "assistant", "첫 번째 답변입니다"),
        reasoning: "첫 번째 답변을 검토했습니다",
      },
    );

    assert.deepEqual(await readdir(join(directory, "chats")), [
      `${chat.id}.json`,
    ]);
    const stored = JSON.parse(
      await readFile(join(directory, "chats", `${chat.id}.json`), "utf8"),
    );
    assert.equal(stored.version, 2);
    assert.equal(stored.chat.mode, "standard");
    assert.equal(stored.chat.stages.generation.profileId, baseProfile.id);
    assert.deepEqual(stored.chat.stages.generation.settingsOverrides, {});

    const profile = await repository.createProfile("정밀", {
      ...defaults,
      systemPrompt: "정밀하게 답변",
      temperature: 1.25,
    });
    await repository.selectProfile(chat.id, "generation", profile.id);
    await repository.updateChatSettings(chat.id, "generation", {
      ...profile.settings,
      temperature: 1.5,
    });

    const restarted = new JsonChatRepository(directory, defaults);
    await restarted.load();
    const loaded = restarted.get(chat.id);
    assert.equal(loaded?.stages.generation.profileId, profile.id);
    assert.equal(loaded?.stages.generation.settings.temperature, 1.5);
    assert.equal(loaded?.stages.generation.messages[1].reasoning, "첫 번째 답변을 검토했습니다");

    await restarted.updateProfile(profile.id, "정밀", {
      ...profile.settings,
      systemPrompt: "변경된 프롬프트",
      temperature: 0.5,
    });
    assert.equal(
      restarted.get(chat.id)?.stages.generation.settings.systemPrompt,
      "변경된 프롬프트",
    );
    assert.equal(
      restarted.get(chat.id)?.stages.generation.settings.temperature,
      1.5,
    );

    const second = await restarted.create();
    assert.equal(second.stages.generation.profileId, profile.id);
    await restarted.deleteProfile(profile.id);
    const fallback = restarted.get(chat.id)?.stages.generation;
    assert.equal(fallback?.profileId, baseProfile.id);
    assert.equal(fallback?.profileFallback, true);
    assert.equal(fallback?.settings.temperature, 1.5);
    assert.equal(await restarted.deleteProfile(baseProfile.id), null);

    await writeFile(join(directory, "profiles.json"), '{"version":3}', "utf8");
    await assert.rejects(
      new JsonChatRepository(directory, defaults).load(),
      /저장 파일 형식/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("번역 단계 이력을 원문과 분리하고 연결된 turn을 함께 삭제한다", async () => {
  const directory = await mkdtemp(join(tmpdir(), "llm-chat-store-"));
  try {
    const repository = new JsonChatRepository(directory, defaults);
    await repository.load();
    const chat = await repository.create("translation");
    if (chat.mode !== "translation") assert.fail("번역 채팅이 필요합니다.");
    assert.equal(
      chat.stages.generation.settings.systemPrompt,
      DEFAULT_GENERATION_SYSTEM_PROMPT,
    );
    assert.equal(
      chat.stages.translation.settings.systemPrompt,
      DEFAULT_TRANSLATION_SYSTEM_PROMPT,
    );

    await repository.appendTurn(
      chat.id,
      "generation",
      message("user-1", "user", "질문"),
      message("english-1", "assistant", "English answer"),
    );
    await repository.upsertTranslationTurn(
      chat.id,
      "english-1",
      {
        ...message("translation-user-1", "user", "English answer"),
        sourceMessageId: "english-1",
      },
      message("korean-1", "assistant", "한글 답변"),
    );

    const saved = repository.get(chat.id);
    assert.equal(saved?.mode, "translation");
    if (saved?.mode !== "translation") assert.fail("번역 채팅이 필요합니다.");
    assert.equal(saved.stages.generation.messages[1].content, "English answer");
    assert.equal(saved.stages.translation.messages[0].sourceMessageId, "english-1");
    assert.equal(saved.stages.translation.messages[1].content, "한글 답변");

    const edited = await repository.updateUserMessage(chat.id, "user-1", "수정된 질문");
    assert.equal(edited?.stages.generation.messages[0].content, "수정된 질문");
    const afterDelete = await repository.deleteTurn(chat.id, "user-1");
    assert.deepEqual(afterDelete?.stages.generation.messages, []);
    if (afterDelete?.mode !== "translation") assert.fail("번역 채팅이 필요합니다.");
    assert.deepEqual(afterDelete.stages.translation.messages, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("버전 1 채팅을 일반 채팅의 생성 단계 구조로 마이그레이션한다", async () => {
  const directory = await mkdtemp(join(tmpdir(), "llm-chat-store-"));
  try {
    await mkdir(join(directory, "chats"), { recursive: true });
    await writeFile(
      join(directory, "profiles.json"),
      JSON.stringify({
        version: 1,
        defaultProfileId: "profile-1",
        profiles: [{ id: "profile-1", name: "기본", settings: defaults }],
      }),
      "utf8",
    );
    await writeFile(
      join(directory, "chats", "legacy-chat.json"),
      JSON.stringify({
        version: 1,
        chat: {
          id: "legacy-chat",
          title: "기존 대화",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          profileId: "profile-1",
          profileFallback: false,
          settingsOverrides: { temperature: 1.2 },
          messages: [
            message("user-1", "user", "질문"),
            message("assistant-1", "assistant", "답변"),
          ],
        },
      }),
      "utf8",
    );

    const repository = new JsonChatRepository(directory, defaults);
    await repository.load();
    const migrated = repository.get("legacy-chat");
    assert.equal(migrated?.mode, "standard");
    assert.equal(migrated?.stages.generation.settings.temperature, 1.2);
    assert.equal(migrated?.stages.generation.messages.length, 2);
    assert.equal(
      JSON.parse(
        await readFile(join(directory, "chats", "legacy-chat.json"), "utf8"),
      ).version,
      2,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function message(
  id: string,
  role: Message["role"],
  content: string,
): Message {
  return {
    id,
    role,
    content,
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "complete",
  };
}
