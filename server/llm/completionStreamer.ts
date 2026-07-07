import type {
  ChatSettings,
  ImageAttachment,
  Message,
} from "../../shared/types/chat.ts";

export type CompletionInput = {
  history: Message[];
  prompt: string;
  attachments: ImageAttachment[];
  settings: ChatSettings;
};

export type CompletionChunk = {
  type: "content" | "reasoning";
  text: string;
};

export type CompletionStreamer = (
  input: CompletionInput,
  signal: AbortSignal,
) => AsyncIterable<CompletionChunk>;
