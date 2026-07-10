import type {
  ChatSettings,
  ImageAttachment,
  Message,
} from "../../shared/types/chat.ts";

export const COMPLETION_CHUNK_TYPE = {
  content: "content",
  reasoning: "reasoning",
} as const;

export type CompletionInput = {
  history: Message[];
  prompt: string;
  attachments: ImageAttachment[];
  settings: ChatSettings;
};

export type CompletionChunk = {
  type: (typeof COMPLETION_CHUNK_TYPE)[keyof typeof COMPLETION_CHUNK_TYPE];
  text: string;
};

export type CompletionStreamer = (
  input: CompletionInput,
  signal: AbortSignal,
) => AsyncIterable<CompletionChunk>;
