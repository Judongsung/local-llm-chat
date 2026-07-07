import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Chat,
  ChatSummary,
  ProfileCatalog,
} from "../../../shared/types/chat.ts";
import * as api from "./chatApi.ts";
import { useChatController } from "./useChatController.ts";

vi.mock("./chatApi.ts");

const chatOne: Chat = {
  id: "chat-1",
  title: "첫 대화",
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
const chatTwo: Chat = { ...chatOne, id: "chat-2", title: "둘째 대화" };
const summaries: ChatSummary[] = [
  summary(chatOne),
  summary(chatTwo),
];
const profileCatalog: ProfileCatalog = {
  defaultProfileId: "profile-1",
  profiles: [
    {
      id: "profile-1",
      name: "기본",
      settings: chatOne.settings,
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listProfiles).mockResolvedValue(profileCatalog);
  vi.mocked(api.listModels).mockResolvedValue(["test-model", "other-model"]);
});

afterEach(cleanup);

describe("useChatController", () => {
  it("대화가 없으면 첫 대화를 생성한다", async () => {
    vi.mocked(api.listChats).mockResolvedValue([]);
    vi.mocked(api.createChat).mockResolvedValue(chatOne);

    const { result } = renderHook(() => useChatController());

    await waitFor(() => expect(result.current.chat?.id).toBe("chat-1"));
    expect(result.current.chats).toEqual([summary(chatOne)]);
  });

  it("대화를 선택하고 현재 대화를 삭제하면 다음 대화를 연다", async () => {
    vi.mocked(api.listChats)
      .mockResolvedValueOnce(summaries)
      .mockResolvedValueOnce([summary(chatOne)]);
    vi.mocked(api.getChat)
      .mockResolvedValueOnce(chatOne)
      .mockResolvedValueOnce(chatTwo)
      .mockResolvedValueOnce(chatOne);
    vi.mocked(api.deleteChat).mockResolvedValue();

    const { result } = renderHook(() => useChatController());
    await waitFor(() => expect(result.current.chat?.id).toBe("chat-1"));

    await act(() => result.current.openChat("chat-2"));
    expect(result.current.chat?.id).toBe("chat-2");

    await act(() => result.current.removeChat("chat-2"));
    expect(result.current.chat?.id).toBe("chat-1");
  });

  it("프로필을 즉시 전환하고 채팅 파라미터만 저장한다", async () => {
    const precision = {
      id: "profile-2",
      name: "정밀",
      settings: {
        ...chatOne.settings,
        systemPrompt: "정밀하게 답변",
        temperature: 0.2,
      },
    };
    const catalog = {
      defaultProfileId: precision.id,
      profiles: [...profileCatalog.profiles, precision],
    };
    const configured: Chat = {
      ...chatOne,
      profileId: precision.id,
      settings: { ...precision.settings, temperature: 0.4 },
    };
    vi.mocked(api.listChats).mockResolvedValue(summaries);
    vi.mocked(api.listProfiles).mockResolvedValue(catalog);
    vi.mocked(api.getChat).mockResolvedValue(chatOne);
    vi.mocked(api.selectProfile).mockResolvedValue({
      ...chatOne,
      profileId: precision.id,
      settings: precision.settings,
    });
    vi.mocked(api.updateChatParameters).mockResolvedValue(configured);

    const { result } = renderHook(() => useChatController());
    await waitFor(() => expect(result.current.chat?.id).toBe("chat-1"));

    await act(() => result.current.chooseProfile(precision.id));
    expect(result.current.chat?.profileId).toBe(precision.id);

    act(() => result.current.changeSetting("temperature", 0.4));
    await act(() => result.current.saveSettings());
    expect(api.updateChatParameters).toHaveBeenCalledWith("chat-1", {
      model: "test-model",
      temperature: 0.4,
      topP: 1,
      maxTokens: 256,
      reasoningEffort: "none",
    });
    expect(result.current.chat?.settings.systemPrompt).toBe("정밀하게 답변");
  });

  it("저장되지 않은 스트림 오류는 낙관적 turn을 제거하고 입력을 복원한다", async () => {
    vi.mocked(api.listChats).mockResolvedValue([summary(chatOne)]);
    vi.mocked(api.getChat).mockResolvedValue(chatOne);
    vi.mocked(api.streamMessage).mockImplementation(
      async (_id, _content, _attachments, _signal, onEvent) => {
        onEvent({
          type: "start",
          userMessageId: "user-1",
          assistantMessageId: "assistant-1",
        });
        onEvent({
          type: "error",
          message: "요청 실패",
          partialSaved: false,
        });
      },
    );

    const { result } = renderHook(() => useChatController());
    await waitFor(() => expect(result.current.chat?.id).toBe("chat-1"));

    act(() => result.current.setDraft("질문"));
    await act(() => result.current.sendMessage());

    expect(result.current.chat?.messages).toEqual([]);
    expect(result.current.draft).toBe("질문");
    expect(result.current.error).toBe("요청 실패");
  });

  it("추론과 답변 스트림을 분리해 반영한다", async () => {
    vi.mocked(api.listChats).mockResolvedValue([summary(chatOne)]);
    vi.mocked(api.getChat).mockResolvedValue(chatOne);
    vi.mocked(api.streamMessage).mockImplementation(
      async (_id, _content, _attachments, _signal, onEvent) => {
        onEvent({
          type: "start",
          userMessageId: "user-1",
          assistantMessageId: "assistant-1",
        });
        onEvent({ type: "reasoning_delta", text: "검토" });
        onEvent({ type: "delta", text: "답변" });
        onEvent({
          type: "error",
          message: "응답 오류",
          partialSaved: true,
        });
      },
    );

    const { result } = renderHook(() => useChatController());
    await waitFor(() => expect(result.current.chat?.id).toBe("chat-1"));

    act(() => result.current.setDraft("질문"));
    await act(() => result.current.sendMessage());

    expect(result.current.chat?.messages[1]).toMatchObject({
      content: "답변",
      reasoning: "검토",
      status: "error",
    });
  });

  it("이전 프롬프트를 수정하고 해당 turn을 삭제한다", async () => {
    const chatWithTurn: Chat = {
      ...chatOne,
      messages: [
        {
          id: "user-1",
          role: "user",
          content: "질문",
          createdAt: chatOne.createdAt,
          status: "complete",
        },
        {
          id: "assistant-1",
          role: "assistant",
          content: "답변",
          createdAt: chatOne.createdAt,
          status: "complete",
        },
      ],
    };
    const edited: Chat = {
      ...chatWithTurn,
      title: "수정된 질문",
      messages: [
        { ...chatWithTurn.messages[0], content: "수정된 질문" },
        chatWithTurn.messages[1],
      ],
    };
    const empty: Chat = { ...edited, messages: [] };
    vi.mocked(api.listChats).mockResolvedValue([summary(chatWithTurn)]);
    vi.mocked(api.getChat).mockResolvedValue(chatWithTurn);
    vi.mocked(api.updateUserMessage).mockResolvedValue(edited);
    vi.mocked(api.deleteTurn).mockResolvedValue(empty);

    const { result } = renderHook(() => useChatController());
    await waitFor(() => expect(result.current.chat?.id).toBe("chat-1"));

    await act(() => result.current.editPrompt("user-1", "수정된 질문"));
    expect(result.current.chat?.messages[0].content).toBe("수정된 질문");

    await act(() => result.current.removePrompt("user-1"));
    expect(result.current.chat?.messages).toEqual([]);
  });
});

function summary(chat: Chat): ChatSummary {
  const { id, title, createdAt, updatedAt } = chat;
  return { id, title, createdAt, updatedAt };
}
