import { describe, expect, it } from "vitest";
import type { Chat } from "../../../shared/types/chat.ts";
import {
  appendPendingTurn,
  removePendingTurn,
  updateAssistantMessage,
} from "./chatState.ts";

const chat: Chat = {
  id: "chat-1",
  title: "테스트",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  mode: "standard",
  stages: {
    generation: {
      profileId: "profile-1",
      profileFallback: false,
      settings: {
        model: "test-model",
        systemPrompt: "",
        temperature: 0.7,
        topP: 1,
        maxTokens: 256,
        reasoningEffort: "none",
      },
      messages: [],
    },
  },
};

describe("chatState", () => {
  it("단계별 낙관적 메시지와 delta를 불변 상태로 반영한다", () => {
    const pending = appendPendingTurn(
      chat,
      "generation",
      "질문",
      [],
      "user-1",
      "assistant-1",
      chat.createdAt,
    );
    const updated = updateAssistantMessage(
      pending,
      "generation",
      "assistant-1",
      "답변",
      "답변 검토",
      "complete",
    );

    expect(chat.stages.generation.messages).toHaveLength(0);
    expect(updated.stages.generation.messages).toHaveLength(2);
    expect(updated.stages.generation.messages[1].content).toBe("답변");
    expect(updated.stages.generation.messages[1].reasoning).toBe("답변 검토");
    expect(
      removePendingTurn(
        pending,
        "generation",
        "user-1",
        "assistant-1",
      ).stages.generation.messages,
    ).toEqual([]);
  });

  it("번역 재시도는 같은 원문의 실패 turn을 교체한다", () => {
    const translationChat: Chat = {
      ...chat,
      mode: "translation",
      stages: {
        generation: chat.stages.generation,
        translation: {
          ...chat.stages.generation,
          messages: [
            {
              id: "old-user",
              role: "user",
              content: "English",
              sourceMessageId: "english-1",
              createdAt: chat.createdAt,
              status: "complete",
            },
            {
              id: "old-assistant",
              role: "assistant",
              content: "부분",
              createdAt: chat.createdAt,
              status: "error",
            },
          ],
        },
      },
    };
    const pending = appendPendingTurn(
      translationChat,
      "translation",
      "English",
      [],
      "new-user",
      "new-assistant",
      chat.createdAt,
      "english-1",
    );
    if (pending.mode !== "translation") throw new Error("번역 채팅 필요");
    expect(pending.stages.translation.messages.map(({ id }) => id)).toEqual([
      "new-user",
      "new-assistant",
    ]);
  });
});
