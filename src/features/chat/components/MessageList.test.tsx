import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Chat,
  ChatStage,
  StandardChat,
} from "../../../../shared/types/chat.ts";
import { MessageList } from "./MessageList.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MessageList", () => {
  it("일반 채팅의 AI 답변만 마크다운으로 렌더링한다", () => {
    const markdownChat: Chat = {
      ...chat,
      stages: {
        generation: {
          ...chat.stages.generation,
          messages: [
            { ...chat.stages.generation.messages[0], content: "**질문**" },
            {
              ...chat.stages.generation.messages[1],
              reasoning: "**계산 과정**\n\n$80\\text{W}$",
              content:
                "## 답변\n\n**강조**와 `코드`\n\n$80\\text{W} \\times 24\\text{시간}$",
            },
          ],
        },
      },
    };
    const { container } = renderList(markdownChat);

    expect(screen.getByText("**질문**").tagName).toBe("DIV");
    expect(screen.getByText("추론 과정").closest("details")?.open).toBe(false);
    expect(screen.getByText("계산 과정").tagName).toBe("STRONG");
    expect(screen.getByRole("heading", { name: "답변" }).tagName).toBe("H2");
    expect(screen.getByText("강조").tagName).toBe("STRONG");
    expect(screen.getByText("코드").tagName).toBe("CODE");
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("번역 답변을 중심으로 표시하고 영문 원문을 접는다", () => {
    const translationChat: Chat = {
      ...chat,
      mode: "translation",
      stages: {
        generation: {
          ...chat.stages.generation,
          messages: [
            chat.stages.generation.messages[0],
            {
              ...chat.stages.generation.messages[1],
              content: "English **answer**",
              reasoning: "English reasoning",
            },
          ],
        },
        translation: {
          ...emptyStage,
          messages: [
            {
              id: "translation-user-1",
              role: "user",
              content: "English **answer**",
              sourceMessageId: "assistant-1",
              createdAt: chat.createdAt,
              status: "complete",
            },
            {
              id: "translation-assistant-1",
              role: "assistant",
              content: "한글 **답변**",
              createdAt: chat.createdAt,
              status: "complete",
            },
          ],
        },
      },
    };
    renderList(translationChat);

    expect(screen.getByText("답변").tagName).toBe("STRONG");
    const original = screen.getByText("영문 원문").closest("details");
    expect(original?.open).toBe(false);
    expect(screen.getByText("English reasoning")).toBeTruthy();
  });

  it("사용자 프롬프트 수정·삭제와 실패한 번역 재시도를 전달한다", async () => {
    const onEdit = vi.fn().mockResolvedValue(true);
    const onDelete = vi.fn().mockResolvedValue(true);
    const onRetry = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <MessageList
        chat={{
          ...chat,
          mode: "translation",
          stages: {
            generation: chat.stages.generation,
            translation: emptyStage,
          },
        }}
        busy={false}
        activeStage={null}
        activeMessageId={null}
        activeSourceMessageId={null}
        onEdit={onEdit}
        onDelete={onDelete}
        onRetryTranslation={onRetry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    fireEvent.change(screen.getByLabelText("프롬프트 수정"), {
      target: { value: "수정된 질문\n둘째 줄" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() =>
      expect(onEdit).toHaveBeenCalledWith("user-1", "수정된 질문\n둘째 줄"),
    );

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith("user-1"));
    fireEvent.click(screen.getByRole("button", { name: "번역 다시 시도" }));
    expect(onRetry).toHaveBeenCalledWith("assistant-1");
  });
});

function renderList(value: Chat) {
  return render(
    <MessageList
      chat={value}
      busy={false}
      activeStage={null}
      activeMessageId={null}
      activeSourceMessageId={null}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onRetryTranslation={vi.fn()}
    />,
  );
}

const emptyStage: ChatStage = {
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

const chat: StandardChat = {
  id: "chat-1",
  title: "질문",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  mode: "standard",
  stages: {
    generation: {
      ...emptyStage,
      messages: [
        {
          id: "user-1",
          role: "user",
          content: "질문",
          createdAt: "2026-01-01T00:00:00.000Z",
          status: "complete",
        },
        {
          id: "assistant-1",
          role: "assistant",
          content: "답변",
          createdAt: "2026-01-01T00:00:00.000Z",
          status: "complete",
        },
      ],
    },
  },
};
