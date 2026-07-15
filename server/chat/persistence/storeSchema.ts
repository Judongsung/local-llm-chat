import type {
  Chat,
  ChatMode,
  ChatSettings,
  ChatSettingsOverrides,
  ImageAttachment,
  Message,
  ParameterProfile,
  ProfileCatalog,
} from "../../../shared/types/chat.ts";
import {
  CHAT_MODE,
  CHAT_SETTING_KEYS,
  CHAT_STAGE,
  CHAT_LIMITS,
  IMAGE_MIME_TYPES,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  REASONING_EFFORT,
  STORE_VERSION,
} from "../../../shared/constants/chat.ts";
import { SERVER_ERROR_MESSAGES } from "../../../shared/constants/serverText.ko.ts";

const LEGACY_STORE_VERSION = 1;

export type StoredChatStage = {
  profileId: string;
  profileFallback: boolean;
  settingsOverrides: ChatSettingsOverrides;
  messages: Message[];
};

type StoredChatBase = Pick<
  Chat,
  "id" | "title" | "createdAt" | "updatedAt"
>;

export type StoredChat = StoredChatBase &
  (
    | {
        mode: typeof CHAT_MODE.standard;
        stages: { generation: StoredChatStage };
      }
    | {
        mode: typeof CHAT_MODE.translation;
        stages: {
          generation: StoredChatStage;
          translation: StoredChatStage;
        };
      }
  );

export type ProfileStore = ProfileCatalog & {
  version: typeof STORE_VERSION;
};

const copy = <T>(value: T): T => structuredClone(value);

export function parseProfileStore(value: unknown): ProfileStore {
  if (
    !isRecord(value) ||
    (value.version !== STORE_VERSION &&
      value.version !== LEGACY_STORE_VERSION) ||
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

export function parseChatFile(value: unknown, expectedId: string): StoredChat {
  if (!isRecord(value)) {
    throw new Error(SERVER_ERROR_MESSAGES.invalidChatFile);
  }

  let chat: StoredChat;
  if (value.version === STORE_VERSION && isStoredChat(value.chat)) {
    chat = value.chat;
  } else if (
    value.version === LEGACY_STORE_VERSION &&
    isLegacyStoredChat(value.chat)
  ) {
    chat = migrateLegacyChat(value.chat);
  } else {
    throw new Error(SERVER_ERROR_MESSAGES.invalidChatFile);
  }

  if (chat.id !== expectedId) {
    throw new Error(SERVER_ERROR_MESSAGES.invalidChatFile);
  }
  return copy(chat);
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

function isStoredChat(value: unknown): value is StoredChat {
  if (
    !isRecord(value) ||
    !isChatMetadata(value) ||
    !isChatMode(value.mode) ||
    !isRecord(value.stages) ||
    !isGenerationStage(value.stages.generation)
  ) {
    return false;
  }
  if (value.mode === CHAT_MODE.standard) {
    return value.stages.translation === undefined;
  }
  return (
    isTranslationStage(value.stages.translation, value.stages.generation) &&
    Object.keys(value.stages).every(
      (key) => key === CHAT_STAGE.generation || key === CHAT_STAGE.translation,
    )
  );
}

function isLegacyStoredChat(value: unknown): value is {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  profileId: string;
  profileFallback: boolean;
  settingsOverrides: ChatSettingsOverrides;
  messages: Message[];
} {
  return (
    isRecord(value) &&
    isChatMetadata(value) &&
    isString(value.profileId) &&
    typeof value.profileFallback === "boolean" &&
    isOverrides(value.settingsOverrides) &&
    isGenerationMessages(value.messages)
  );
}

function migrateLegacyChat(value: {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  profileId: string;
  profileFallback: boolean;
  settingsOverrides: ChatSettingsOverrides;
  messages: Message[];
}): StoredChat {
  const {
    id,
    title,
    createdAt,
    updatedAt,
    profileId,
    profileFallback,
    settingsOverrides,
    messages,
  } = value;
  return {
    id,
    title,
    createdAt,
    updatedAt,
    mode: CHAT_MODE.standard,
    stages: {
      generation: {
        profileId,
        profileFallback,
        settingsOverrides,
        messages,
      },
    },
  };
}

function isChatMetadata(value: Record<string, unknown>) {
  return (
    isString(value.id) &&
    isString(value.title) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

function isChatMode(value: unknown): value is ChatMode {
  return value === CHAT_MODE.standard || value === CHAT_MODE.translation;
}

function isGenerationStage(value: unknown): value is StoredChatStage {
  return isStage(value) && isGenerationMessages(value.messages);
}

function isTranslationStage(
  value: unknown,
  generation: StoredChatStage,
): value is StoredChatStage {
  if (!isStage(value)) return false;
  const sourceIds = new Set(
    generation.messages
      .filter((message) => message.role === MESSAGE_ROLE.assistant)
      .map((message) => message.id),
  );
  const usedSources = new Set<string>();
  for (let index = 0; index < value.messages.length; index += 2) {
    const user = value.messages[index];
    const assistant = value.messages[index + 1];
    if (
      user?.role !== MESSAGE_ROLE.user ||
      !user.sourceMessageId ||
      !sourceIds.has(user.sourceMessageId) ||
      usedSources.has(user.sourceMessageId) ||
      assistant?.role !== MESSAGE_ROLE.assistant ||
      assistant.sourceMessageId !== undefined
    ) {
      return false;
    }
    usedSources.add(user.sourceMessageId);
  }
  return true;
}

function isStage(value: unknown): value is StoredChatStage {
  return (
    isRecord(value) &&
    isString(value.profileId) &&
    typeof value.profileFallback === "boolean" &&
    isOverrides(value.settingsOverrides) &&
    Array.isArray(value.messages) &&
    value.messages.every(isMessage)
  );
}

function isGenerationMessages(value: unknown): value is Message[] {
  return (
    Array.isArray(value) &&
    value.every(
      (message) => isMessage(message) && message.sourceMessageId === undefined,
    )
  );
}

function isOverrides(value: unknown): value is ChatSettingsOverrides {
  if (!isRecord(value)) return false;
  const allowed = new Set<string>(CHAT_SETTING_KEYS);
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  return (
    (value.model === undefined ||
      (isString(value.model) &&
        Boolean(value.model.trim()) &&
        value.model.length <= CHAT_LIMITS.model)) &&
    (value.systemPrompt === undefined ||
      (isString(value.systemPrompt) &&
        value.systemPrompt.length <= CHAT_LIMITS.systemPrompt)) &&
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
    Object.values(REASONING_EFFORT).some((effort) => effort === value)
  );
}

function isMessage(value: unknown): value is Message {
  return (
    isRecord(value) &&
    isString(value.id) &&
    (value.role === MESSAGE_ROLE.user ||
      value.role === MESSAGE_ROLE.assistant) &&
    isString(value.content) &&
    (value.sourceMessageId === undefined || isString(value.sourceMessageId)) &&
    (value.attachments === undefined ||
      (Array.isArray(value.attachments) &&
        value.attachments.every(isImageAttachment))) &&
    (value.reasoning === undefined || isString(value.reasoning)) &&
    isString(value.createdAt) &&
    (value.status === MESSAGE_STATUS.complete ||
      value.status === MESSAGE_STATUS.stopped ||
      value.status === MESSAGE_STATUS.error)
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
