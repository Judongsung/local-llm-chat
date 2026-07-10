import type {
  CHAT_MODE,
  CHAT_STAGE,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  REASONING_EFFORT,
  STREAM_EVENT,
} from "../constants/chat.ts";

type ValueOf<T> = T[keyof T];

export type MessageStatus = ValueOf<typeof MESSAGE_STATUS>;
export type ReasoningEffort = ValueOf<typeof REASONING_EFFORT>;
export type ChatMode = ValueOf<typeof CHAT_MODE>;
export type ChatStageKey = ValueOf<typeof CHAT_STAGE>;
export type MessageRole = ValueOf<typeof MESSAGE_ROLE>;

export type ImageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  size: number;
};

export type MessageInput = {
  content: string;
  attachments: ImageAttachment[];
};

export type Message = {
  id: string;
  role: MessageRole;
  content: string;
  sourceMessageId?: string;
  attachments?: ImageAttachment[];
  reasoning?: string;
  createdAt: string;
  status: MessageStatus;
};

export type ChatSettings = {
  model: string;
  systemPrompt: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  reasoningEffort: ReasoningEffort;
};

export type ChatParameters = Omit<ChatSettings, "systemPrompt">;
export type ChatSettingsOverrides = Partial<ChatSettings>;

export type ParameterProfile = {
  id: string;
  name: string;
  settings: ChatSettings;
};

export type ProfileCatalog = {
  defaultProfileId: string;
  profiles: ParameterProfile[];
};

export type ChatStage = {
  profileId: string;
  profileFallback: boolean;
  settings: ChatSettings;
  messages: Message[];
};

type ChatBase = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type StandardChat = ChatBase & {
  mode: typeof CHAT_MODE.standard;
  stages: { generation: ChatStage };
};

export type TranslationChat = ChatBase & {
  mode: typeof CHAT_MODE.translation;
  stages: { generation: ChatStage; translation: ChatStage };
};

export type Chat = StandardChat | TranslationChat;

export type ChatSummary = Pick<
  Chat,
  "id" | "title" | "createdAt" | "updatedAt" | "mode"
>;

export type StreamEvent =
  | {
      type: typeof STREAM_EVENT.start;
      stage: ChatStageKey;
      userMessageId: string;
      assistantMessageId: string;
      sourceMessageId?: string;
    }
  | { type: typeof STREAM_EVENT.delta; stage: ChatStageKey; text: string }
  | {
      type: typeof STREAM_EVENT.reasoningDelta;
      stage: ChatStageKey;
      text: string;
    }
  | { type: typeof STREAM_EVENT.done; chat: Chat }
  | {
      type: typeof STREAM_EVENT.error;
      stage: ChatStageKey;
      message: string;
      chat: Chat;
    };
