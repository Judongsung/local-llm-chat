import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Chat,
  ChatSettings,
  ChatStage,
  ChatSummary,
  ProfileCatalog,
} from "../../../shared/types/chat.ts";
import * as api from "./chatApi.ts";
import { useChatController } from "./useChatController.ts";

vi.mock("./chatApi.ts");

const settings: ChatSettings = {
  model: "test-model",
  systemPrompt: "",
  temperature: 0.7,
  topP: 1,
  maxTokens: 256,
  reasoningEffort: "none",
};
const emptyStage: ChatStage = {
  profileId: "profile-1",
  profileFallback: false,
  settings,
  messages: [],
};
const chatOne: Chat = {
  id: "chat-1",
  title: "첫 대화",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  mode: "standard",
  stages: { generation: emptyStage },
};
const translationChat: Chat = {
  ...chatOne,
  id: "translation-1",
  mode: "translation",
  stages: {
    generation: { ...emptyStage, settings: { ...settings, systemPrompt: "영어" } },
    translation: { ...emptyStage, settings: { ...settings, systemPrompt: "번역" } },
  },
};
const profileCatalog: ProfileCatalog = {
  defaultProfileId: "profile-1",
  profiles: [{ id: "profile-1", name: "기본", settings }],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listProfiles).mockResolvedValue(profileCatalog);
  vi.mocked(api.listModels).mockResolvedValue(["test-model", "other-model"]);
});

afterEach(cleanup);

describe("useChatController", () => {
  it("대화가 없으면 자동 생성하지 않고 유형 선택을 기다린다", async () => {
    vi.mocked(api.listChats).mockResolvedValue([]);
    const { result } = renderHook(() => useChatController());

    await waitFor(() => expect(result.current.initialized).toBe(true));
    expect(result.current.chat).toBeNull();
    expect(api.createChat).not.toHaveBeenCalled();
  });

  it("선택한 유형으로 새 대화를 만든다", async () => {
    vi.mocked(api.listChats)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([summary(translationChat)]);
    vi.mocked(api.createChat).mockResolvedValue(translationChat);
    const { result } = renderHook(() => useChatController());
    await waitFor(() => expect(result.current.initialized).toBe(true));

    await act(() => result.current.addChat("translation"));
    expect(api.createChat).toHaveBeenCalledWith("translation");
    expect(result.current.chat?.mode).toBe("translation");
  });

  it("단계별 프로필과 시스템 프롬프트를 포함한 설정을 저장한다", async () => {
    const configured: Chat = {
      ...translationChat,
      stages: {
        ...translationChat.stages,
        translation: {
          ...translationChat.stages.translation,
          settings: { ...settings, systemPrompt: "새 번역 프롬프트", temperature: 0.4 },
        },
      },
    };
    vi.mocked(api.listChats).mockResolvedValue([summary(translationChat)]);
    vi.mocked(api.getChat).mockResolvedValue(translationChat);
    vi.mocked(api.selectProfile).mockResolvedValue(translationChat);
    vi.mocked(api.updateChatSettings).mockResolvedValue(configured);
    const { result } = renderHook(() => useChatController());
    await waitFor(() => expect(result.current.chat?.id).toBe("translation-1"));

    await act(() => result.current.chooseProfile("translation", "profile-2"));
    expect(api.selectProfile).toHaveBeenCalledWith(
      "translation-1",
      "translation",
      "profile-2",
    );
    act(() => {
      result.current.changeSetting(
        "translation",
        "systemPrompt",
        "새 번역 프롬프트",
      );
      result.current.changeSetting("translation", "temperature", 0.4);
    });
    await act(() => result.current.saveSettings("translation"));
    expect(api.updateChatSettings).toHaveBeenCalledWith(
      "translation-1",
      "translation",
      expect.objectContaining({
        systemPrompt: "새 번역 프롬프트",
        temperature: 0.4,
      }),
    );
  });

  it("저장되지 않은 생성 오류에서 입력을 복원한다", async () => {
    vi.mocked(api.listChats).mockResolvedValue([summary(chatOne)]);
    vi.mocked(api.getChat).mockResolvedValue(chatOne);
    vi.mocked(api.streamMessage).mockImplementation(
      async (_id, _content, _attachments, _signal, onEvent) => {
        onEvent({
          type: "start",
          stage: "generation",
          userMessageId: "user-1",
          assistantMessageId: "assistant-1",
        });
        onEvent({
          type: "error",
          stage: "generation",
          message: "요청 실패",
          chat: chatOne,
        });
      },
    );
    const { result } = renderHook(() => useChatController());
    await waitFor(() => expect(result.current.chat?.id).toBe("chat-1"));

    act(() => result.current.setDraft("질문"));
    await act(() => result.current.sendMessage());
    expect(result.current.chat?.stages.generation.messages).toEqual([]);
    expect(result.current.draft).toBe("질문");
    expect(result.current.error).toBe("요청 실패");
  });

  it("생성과 번역 스트림을 각 단계 이력에 반영한다", async () => {
    const completed: Chat = {
      ...translationChat,
      stages: {
        generation: {
          ...translationChat.stages.generation,
          messages: [
            message("user-1", "user", "질문"),
            message("english-1", "assistant", "English answer"),
          ],
        },
        translation: {
          ...translationChat.stages.translation,
          messages: [
            {
              ...message("translation-user-1", "user", "English answer"),
              sourceMessageId: "english-1",
            },
            message("korean-1", "assistant", "한글 답변"),
          ],
        },
      },
    };
    vi.mocked(api.listChats).mockResolvedValue([summary(translationChat)]);
    vi.mocked(api.getChat).mockResolvedValue(translationChat);
    vi.mocked(api.streamMessage).mockImplementation(
      async (_id, _content, _attachments, _signal, onEvent) => {
        onEvent({
          type: "start",
          stage: "generation",
          userMessageId: "user-1",
          assistantMessageId: "english-1",
        });
        onEvent({ type: "delta", stage: "generation", text: "English answer" });
        onEvent({
          type: "start",
          stage: "translation",
          userMessageId: "translation-user-1",
          assistantMessageId: "korean-1",
          sourceMessageId: "english-1",
        });
        onEvent({ type: "delta", stage: "translation", text: "한글 답변" });
        onEvent({ type: "done", chat: completed });
      },
    );
    const { result } = renderHook(() => useChatController());
    await waitFor(() => expect(result.current.chat?.id).toBe("translation-1"));

    act(() => result.current.setDraft("질문"));
    await act(() => result.current.sendMessage());
    expect(result.current.chat?.stages.generation.messages[1].content).toBe(
      "English answer",
    );
    if (result.current.chat?.mode !== "translation") {
      throw new Error("번역 채팅이 필요합니다.");
    }
    expect(result.current.chat.stages.translation.messages[1].content).toBe(
      "한글 답변",
    );
  });
});

function summary(chat: Chat): ChatSummary {
  const { id, title, createdAt, updatedAt, mode } = chat;
  return { id, title, createdAt, updatedAt, mode };
}

function message(
  id: string,
  role: "user" | "assistant",
  content: string,
) {
  return {
    id,
    role,
    content,
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "complete" as const,
  };
}
