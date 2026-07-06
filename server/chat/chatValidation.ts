import type {
  ChatParameters,
  ChatSettings,
} from "../../shared/types/chat.ts";
import { CHAT_LIMITS } from "../../shared/constants/chat.ts";

export function parsePrompt(value: unknown): string | null {
  return typeof value === "string" &&
    value.trim() &&
    value.length <= CHAT_LIMITS.message
    ? value
    : null;
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const inRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;
