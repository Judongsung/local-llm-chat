import type {
  Chat,
  ChatSummary,
  MessageStatus,
} from "../../../shared/types/chat.ts";

export function appendPendingTurn(
  chat: Chat,
  content: string,
  userId: string,
  assistantId: string,
  createdAt: string,
): Chat {
  return {
    ...chat,
    messages: [
      ...chat.messages,
      {
        id: userId,
        role: "user",
        content,
        createdAt,
        status: "complete",
      },
      {
        id: assistantId,
        role: "assistant",
        content: "",
        createdAt,
        status: "complete",
      },
    ],
  };
}

export function updateAssistantMessage(
  chat: Chat,
  assistantId: string,
  content: string,
  reasoning: string,
  status: MessageStatus,
): Chat {
  return {
    ...chat,
    messages: chat.messages.map((message) =>
      message.id === assistantId
        ? {
            ...message,
            content,
            ...(reasoning ? { reasoning } : {}),
            status,
          }
        : message,
    ),
  };
}

export function removePendingTurn(
  chat: Chat,
  userId: string,
  assistantId: string,
): Chat {
  return {
    ...chat,
    messages: chat.messages.filter(
      (message) => message.id !== userId && message.id !== assistantId,
    ),
  };
}

export function toSummary(chat: Chat): ChatSummary {
  const { id, title, createdAt, updatedAt } = chat;
  return { id, title, createdAt, updatedAt };
}
