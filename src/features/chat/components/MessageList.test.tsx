import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Chat } from "../../../../shared/types/chat.ts";
import { MessageList } from "./MessageList.tsx";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MessageList", () => {
  it("AI 답변만 마크다운으로 렌더링한다", () => {
    const { container } = render(
      <MessageList
        chat={{
          ...chat,
          messages: [
            { ...chat.messages[0], content: "**질문**" },
            {
              ...chat.messages[1],
              reasoning: "**계산 과정**\n\n$80\\text{W}$",
              content:
                "## 답변\n\n**강조**와 `코드`\n\n$80\\text{W} \\times 24\\text{시간}$",
            },
          ],
        }}
        busy={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("**질문**").tagName).toBe("DIV");
    expect(screen.getByText("추론 과정").closest("details")?.open).toBe(false);
    expect(screen.getByText("계산 과정").tagName).toBe("STRONG");
    expect(screen.getByRole("heading", { name: "답변" }).tagName).toBe("H2");
    expect(screen.getByText("강조").tagName).toBe("STRONG");
    expect(screen.getByText("코드").tagName).toBe("CODE");
    expect(container.querySelector(".katex")).not.toBeNull();
    expect(container.querySelector("math")).not.toBeNull();
  });

  it("응답 중 추론을 펼치고 완료되면 접는다", () => {
    const reasoningChat: Chat = {
      ...chat,
      messages: [
        chat.messages[0],
        { ...chat.messages[1], reasoning: "검토 중" },
      ],
    };
    const { rerender } = render(
      <MessageList
        chat={reasoningChat}
        busy
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const details = screen.getByText("추론 과정").closest("details");

    expect(details?.open).toBe(true);
    rerender(
      <MessageList
        chat={reasoningChat}
        busy={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(details?.open).toBe(false);
  });

  it("사용자 프롬프트를 인라인으로 수정하고 turn 삭제를 확인한다", async () => {
    const onEdit = vi.fn().mockResolvedValue(true);
    const onDelete = vi.fn().mockResolvedValue(true);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <MessageList
        chat={chat}
        busy={false}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    fireEvent.change(screen.getByLabelText("프롬프트 수정"), {
      target: { value: "수정된 질문\n둘째 줄" },
    });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() =>
      expect(onEdit).toHaveBeenCalledWith(
        "user-1",
        "수정된 질문\n둘째 줄",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith("user-1"));
  });
});

const chat: Chat = {
  id: "chat-1",
  title: "질문",
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
};
