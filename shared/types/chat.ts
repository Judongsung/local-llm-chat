export type MessageStatus = "complete" | "stopped" | "error";
export type ReasoningEffort = "none" | "low" | "medium" | "high";

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
  role: "user" | "assistant";
  content: string;
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
export type ChatSettingsOverrides = Partial<ChatParameters>;

export type ParameterProfile = {
  id: string;
  name: string;
  settings: ChatSettings;
};

export type ProfileCatalog = {
  defaultProfileId: string;
  profiles: ParameterProfile[];
};

export type Chat = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  profileId: string;
  profileFallback: boolean;
  settings: ChatSettings;
  messages: Message[];
};

export type ChatSummary = Pick<
  Chat,
  "id" | "title" | "createdAt" | "updatedAt"
>;

export type StreamEvent =
  | {
      type: "start";
      userMessageId: string;
      assistantMessageId: string;
    }
  | { type: "delta"; text: string }
  | { type: "reasoning_delta"; text: string }
  | { type: "done"; chat: Chat }
  | { type: "error"; message: string; partialSaved: boolean };
