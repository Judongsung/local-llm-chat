import type {
  Chat,
  ChatStage,
  ChatStageKey,
  ChatSummary,
  ImageAttachment,
  Message,
  MessageStatus,
} from "../../../shared/types/chat.ts";
import {
  CHAT_MODE,
  CHAT_STAGE,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
} from "../../../shared/constants/chat.ts";

export function appendPendingTurn(
  chat: Chat,
  stage: ChatStageKey,
  content: string,
  attachments: ImageAttachment[],
  userId: string,
  assistantId: string,
  createdAt: string,
  sourceMessageId?: string,
): Chat {
  return updateStage(chat, stage, (current) => {
    const pending: Message[] = [
      {
        id: userId,
        role: MESSAGE_ROLE.user,
        content,
        ...(sourceMessageId ? { sourceMessageId } : {}),
        ...(attachments.length ? { attachments } : {}),
        createdAt,
        status: MESSAGE_STATUS.complete,
      },
      {
        id: assistantId,
        role: MESSAGE_ROLE.assistant,
        content: "",
        createdAt,
        status: MESSAGE_STATUS.complete,
      },
    ];
    const messages = [...current.messages];
    const existing = sourceMessageId
      ? messages.findIndex(
          (message) => message.sourceMessageId === sourceMessageId,
        )
      : -1;
    if (existing >= 0) messages.splice(existing, 2, ...pending);
    else messages.push(...pending);
    return { ...current, messages };
  });
}

export function updateAssistantMessage(
  chat: Chat,
  stage: ChatStageKey,
  assistantId: string,
  content: string,
  reasoning: string,
  status: MessageStatus,
): Chat {
  return updateStage(chat, stage, (current) => ({
    ...current,
    messages: current.messages.map((message) =>
      message.id === assistantId
        ? {
            ...message,
            content,
            ...(reasoning ? { reasoning } : {}),
            status,
          }
        : message,
    ),
  }));
}

export function removePendingTurn(
  chat: Chat,
  stage: ChatStageKey,
  userId: string,
  assistantId: string,
): Chat {
  return updateStage(chat, stage, (current) => ({
    ...current,
    messages: current.messages.filter(
      (message) => message.id !== userId && message.id !== assistantId,
    ),
  }));
}

export function updateStage(
  chat: Chat,
  stage: ChatStageKey,
  update: (current: ChatStage) => ChatStage,
): Chat {
  if (stage === CHAT_STAGE.translation) {
    return chat.mode === CHAT_MODE.translation
      ? {
          ...chat,
          stages: {
            ...chat.stages,
            translation: update(chat.stages.translation),
          },
        }
      : chat;
  }
  if (chat.mode === CHAT_MODE.translation) {
    return {
      ...chat,
      stages: {
        ...chat.stages,
        generation: update(chat.stages.generation),
      },
    };
  }
  return {
    ...chat,
    stages: { generation: update(chat.stages.generation) },
  };
}

export function toSummary(chat: Chat): ChatSummary {
  const { id, title, createdAt, updatedAt, mode } = chat;
  return { id, title, createdAt, updatedAt, mode };
}
