import type {
  Chat,
  ChatSettings,
  ChatSettingsOverrides,
  ImageAttachment,
  Message,
  ParameterProfile,
  ProfileCatalog,
} from "../../../shared/types/chat.ts";
import {
  CHAT_LIMITS,
  IMAGE_MIME_TYPES,
  STORE_VERSION,
} from "../../../shared/constants/chat.ts";
import { SERVER_ERROR_MESSAGES } from "../../../shared/constants/server.ts";

export type StoredChat = Omit<Chat, "settings"> & {
  settingsOverrides: ChatSettingsOverrides;
};

export type ProfileStore = ProfileCatalog & {
  version: typeof STORE_VERSION;
};

const copy = <T>(value: T): T => structuredClone(value);

export function parseProfileStore(value: unknown): ProfileStore {
  if (
    !isRecord(value) ||
    value.version !== STORE_VERSION ||
    !isString(value.defaultProfileId) ||
    !Array.isArray(value.profiles) ||
    value.profiles.length === 0 ||
    !value.profiles.every(isProfile)
  ) {
    throw new Error(SERVER_ERROR_MESSAGES.invalidProfileStore);
  }

  const profiles = value.profiles as ParameterProfile[];
  const ids = new Set(profiles.map((profile) => profile.id));
  const names = new Set(
    profiles.map((profile) => profile.name.toLocaleLowerCase()),
  );
  if (
    ids.size !== profiles.length ||
    names.size !== profiles.length ||
    !ids.has(value.defaultProfileId)
  ) {
    throw new Error(SERVER_ERROR_MESSAGES.invalidProfileStoreValues);
  }
  return {
    version: STORE_VERSION,
    defaultProfileId: value.defaultProfileId,
    profiles: copy(profiles),
  };
}

export function parseChatFile(
  value: unknown,
  expectedId: string,
): StoredChat {
  if (
    !isRecord(value) ||
    value.version !== STORE_VERSION ||
    !isStoredChat(value.chat) ||
    value.chat.id !== expectedId
  ) {
    throw new Error(SERVER_ERROR_MESSAGES.invalidChatFile);
  }
  return copy(value.chat);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isString = (value: unknown): value is string => typeof value === "string";
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const inRange = (value: unknown, min: number, max: number) =>
  isFiniteNumber(value) && value >= min && value <= max;

function isProfile(value: unknown): value is ParameterProfile {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    Boolean(value.name.trim()) &&
    value.name.length <= CHAT_LIMITS.profileName &&
    isSettings(value.settings)
  );
}

function isSettings(value: unknown): value is ChatSettings {
  return (
    isRecord(value) &&
    isString(value.model) &&
    Boolean(value.model.trim()) &&
    value.model.length <= CHAT_LIMITS.model &&
    isString(value.systemPrompt) &&
    value.systemPrompt.length <= CHAT_LIMITS.systemPrompt &&
    inRange(
      value.temperature,
      CHAT_LIMITS.temperature.min,
      CHAT_LIMITS.temperature.max,
    ) &&
    inRange(value.topP, CHAT_LIMITS.topP.min, CHAT_LIMITS.topP.max) &&
    Number.isInteger(value.maxTokens) &&
    inRange(
      value.maxTokens,
      CHAT_LIMITS.maxTokens.min,
      CHAT_LIMITS.maxTokens.max,
    ) &&
    isReasoningEffort(value.reasoningEffort)
  );
}

function isStoredChat(
  value: unknown,
): value is StoredChat {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.title) &&
    isString(value.createdAt) &&
    isString(value.updatedAt) &&
    isString(value.profileId) &&
    typeof value.profileFallback === "boolean" &&
    isOverrides(value.settingsOverrides) &&
    Array.isArray(value.messages) &&
    value.messages.every(isMessage)
  );
}

function isOverrides(value: unknown): value is ChatSettingsOverrides {
  if (!isRecord(value)) return false;
  const allowed = new Set([
    "model",
    "temperature",
    "topP",
    "maxTokens",
    "reasoningEffort",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  return (
    (value.model === undefined ||
      (isString(value.model) &&
        Boolean(value.model.trim()) &&
        value.model.length <= CHAT_LIMITS.model)) &&
    (value.temperature === undefined ||
      inRange(
        value.temperature,
        CHAT_LIMITS.temperature.min,
        CHAT_LIMITS.temperature.max,
      )) &&
    (value.topP === undefined ||
      inRange(value.topP, CHAT_LIMITS.topP.min, CHAT_LIMITS.topP.max)) &&
    (value.maxTokens === undefined ||
      (Number.isInteger(value.maxTokens) &&
        inRange(
          value.maxTokens,
          CHAT_LIMITS.maxTokens.min,
          CHAT_LIMITS.maxTokens.max,
        ))) &&
    (value.reasoningEffort === undefined ||
      isReasoningEffort(value.reasoningEffort))
  );
}

function isReasoningEffort(value: unknown) {
  return (
    value === "none" ||
    value === "low" ||
    value === "medium" ||
    value === "high"
  );
}

function isMessage(value: unknown): value is Message {
  return (
    isRecord(value) &&
    isString(value.id) &&
    (value.role === "user" || value.role === "assistant") &&
    isString(value.content) &&
    (value.attachments === undefined ||
      (Array.isArray(value.attachments) &&
        value.attachments.every(isImageAttachment))) &&
    (value.reasoning === undefined || isString(value.reasoning)) &&
    isString(value.createdAt) &&
    (value.status === "complete" ||
      value.status === "stopped" ||
      value.status === "error")
  );
}

function isImageAttachment(value: unknown): value is ImageAttachment {
  return (
    isRecord(value) &&
    isString(value.id) &&
    Boolean(value.id.trim()) &&
    isString(value.name) &&
    Boolean(value.name.trim()) &&
    value.name.length <= CHAT_LIMITS.attachments.name &&
    isString(value.mimeType) &&
    IMAGE_MIME_TYPES.some((mimeType) => mimeType === value.mimeType) &&
    isString(value.dataUrl) &&
    value.dataUrl.startsWith(`data:${value.mimeType};base64,`) &&
    isFiniteNumber(value.size) &&
    Number.isInteger(value.size) &&
    value.size > 0 &&
    value.size <= CHAT_LIMITS.attachments.bytes
  );
}
