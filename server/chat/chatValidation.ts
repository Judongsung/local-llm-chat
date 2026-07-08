import type {
  ChatParameters,
  ChatSettings,
  ImageAttachment,
  MessageInput,
} from "../../shared/types/chat.ts";
import {
  CHAT_LIMITS,
  IMAGE_MIME_TYPES,
} from "../../shared/constants/chat.ts";

const IMAGE_DATA_URL_PATTERN = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/;

export function parsePrompt(value: unknown): string | null {
  return typeof value === "string" &&
    value.trim() &&
    value.length <= CHAT_LIMITS.message
    ? value
    : null;
}

export function parseMessageInput(value: unknown): MessageInput | null {
  if (!isRecord(value) || typeof value.content !== "string") return null;
  const content = value.content;
  const attachments = parseImageAttachments(value.attachments);
  if (
    !attachments ||
    content.length > CHAT_LIMITS.message ||
    (!content.trim() && attachments.length === 0)
  ) {
    return null;
  }
  return { content, attachments };
}

export function parseChatSettings(value: unknown): ChatSettings | null {
  if (!isRecord(value)) return null;
  const {
    model,
    systemPrompt,
    temperature,
    topP,
    maxTokens,
    reasoningEffort,
  } = value;
  if (
    typeof model !== "string" ||
    !model.trim() ||
    model.length > CHAT_LIMITS.model ||
    typeof systemPrompt !== "string" ||
    systemPrompt.length > CHAT_LIMITS.systemPrompt ||
    !inRange(
      temperature,
      CHAT_LIMITS.temperature.min,
      CHAT_LIMITS.temperature.max,
    ) ||
    !inRange(topP, CHAT_LIMITS.topP.min, CHAT_LIMITS.topP.max) ||
    !Number.isInteger(maxTokens) ||
    !inRange(maxTokens, CHAT_LIMITS.maxTokens.min, CHAT_LIMITS.maxTokens.max) ||
    (reasoningEffort !== "none" &&
      reasoningEffort !== "low" &&
      reasoningEffort !== "medium" &&
      reasoningEffort !== "high")
  ) {
    return null;
  }
  return {
    model: model.trim(),
    systemPrompt,
    temperature,
    topP,
    maxTokens,
    reasoningEffort,
  };
}

export function parseChatParameters(value: unknown): ChatParameters | null {
  if (!isRecord(value)) return null;
  const { model, temperature, topP, maxTokens, reasoningEffort } = value;
  if (
    typeof model !== "string" ||
    !model.trim() ||
    model.length > CHAT_LIMITS.model ||
    !inRange(
      temperature,
      CHAT_LIMITS.temperature.min,
      CHAT_LIMITS.temperature.max,
    ) ||
    !inRange(topP, CHAT_LIMITS.topP.min, CHAT_LIMITS.topP.max) ||
    !Number.isInteger(maxTokens) ||
    !inRange(maxTokens, CHAT_LIMITS.maxTokens.min, CHAT_LIMITS.maxTokens.max) ||
    (reasoningEffort !== "none" &&
      reasoningEffort !== "low" &&
      reasoningEffort !== "medium" &&
      reasoningEffort !== "high")
  ) {
    return null;
  }
  return {
    model: model.trim(),
    temperature,
    topP,
    maxTokens,
    reasoningEffort,
  };
}

export function parseProfileName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name && name.length <= CHAT_LIMITS.profileName ? name : null;
}

function parseImageAttachments(value: unknown): ImageAttachment[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > CHAT_LIMITS.attachments.count) {
    return null;
  }
  const attachments: ImageAttachment[] = [];
  for (const item of value) {
    const attachment = parseImageAttachment(item);
    if (!attachment) return null;
    attachments.push(attachment);
  }
  return attachments;
}

function parseImageAttachment(value: unknown): ImageAttachment | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > CHAT_LIMITS.attachments.name ||
    typeof value.mimeType !== "string" ||
    !IMAGE_MIME_TYPES.some((mimeType) => mimeType === value.mimeType) ||
    typeof value.dataUrl !== "string" ||
    typeof value.size !== "number" ||
    !Number.isInteger(value.size) ||
    value.size <= 0 ||
    value.size > CHAT_LIMITS.attachments.requestBytes
  ) {
    return null;
  }

  const match = IMAGE_DATA_URL_PATTERN.exec(value.dataUrl);
  if (!match || match[1] !== value.mimeType) return null;

  let bytes: number;
  try {
    bytes = Buffer.from(match[2], "base64").byteLength;
  } catch {
    return null;
  }
  if (bytes !== value.size || bytes > CHAT_LIMITS.attachments.requestBytes) {
    return null;
  }

  return {
    id: value.id.trim(),
    name: value.name,
    mimeType: value.mimeType,
    dataUrl: value.dataUrl,
    size: value.size,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const inRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;
