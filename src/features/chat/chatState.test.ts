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
};

describe("chatState", () => {
  it("낙관적 메시지 추가와 delta 반영을 불변 상태로 처리한다", () => {
    const pending = appendPendingTurn(
      chat,
      "질문",
      "user-1",
      "assistant-1",
      chat.createdAt,
    );
    const updated = updateAssistantMessage(
      pending,
      "assistant-1",
      "답변",
      "답변 검토",
      "complete",
    );

    expect(chat.messages).toHaveLength(0);
    expect(updated.messages).toHaveLength(2);
    expect(updated.messages[1].content).toBe("답변");
    expect(updated.messages[1].reasoning).toBe("답변 검토");
  });

  it("저장되지 않은 turn을 함께 제거한다", () => {
    const pending = appendPendingTurn(
      chat,
      "질문",
      "user-1",
      "assistant-1",
      chat.createdAt,
    );
    expect(removePendingTurn(pending, "user-1", "assistant-1").messages).toEqual(
      [],
    );
  });
});
