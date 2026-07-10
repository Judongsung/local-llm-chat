import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  Chat,
  ChatMode,
  ChatSettings,
  ChatSettingsOverrides,
  ChatStage,
  ChatStageKey,
  ChatSummary,
  Message,
  ParameterProfile,
  ProfileCatalog,
} from "../../../shared/types/chat.ts";
import {
  CHAT_MODE,
  CHAT_SETTING_KEYS,
  CHAT_STAGE,
  CHAT_LIMITS,
  DEFAULT_CHAT_TITLE,
  DEFAULT_GENERATION_SYSTEM_PROMPT,
  DEFAULT_PROFILE_NAME,
  DEFAULT_TRANSLATION_SYSTEM_PROMPT,
  MESSAGE_ROLE,
  STORE_VERSION,
} from "../../../shared/constants/chat.ts";
import {
  SERVER_ERROR_MESSAGES,
  SERVER_FILE_ENCODING,
} from "../../../shared/constants/server.ts";
import type { ChatRepository } from "../chatRepository.ts";
import {
  parseChatFile,
  parseProfileStore,
  type ProfileStore,
  type StoredChat,
  type StoredChatStage,
} from "./storeSchema.ts";

const CHATS_DIRECTORY = "chats";
const PROFILES_FILE = "profiles.json";
const JSON_SUFFIX = ".json";
const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const FILE_NOT_FOUND_CODE = "ENOENT";
const copy = <T>(value: T): T => structuredClone(value);

type RepositoryData = {
  profileStore: ProfileStore;
  chats: StoredChat[];
};

export class JsonChatRepository implements ChatRepository {
  private data: RepositoryData;
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly chatsDirectory: string;
  private readonly profilesPath: string;

  constructor(dataDirectory: string, defaults: ChatSettings) {
    const profile: ParameterProfile = {
      id: randomUUID(),
      name: DEFAULT_PROFILE_NAME,
      settings: copy(defaults),
    };
    this.chatsDirectory = join(dataDirectory, CHATS_DIRECTORY);
    this.profilesPath = join(dataDirectory, PROFILES_FILE);
    this.data = {
      profileStore: {
        version: STORE_VERSION,
        defaultProfileId: profile.id,
        profiles: [profile],
      },
      chats: [],
    };
  }

  async load() {
    await this.loadProfiles();
    this.data.chats = [];

    let entries;
    try {
      entries = await readdir(this.chatsDirectory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === FILE_NOT_FOUND_CODE) return;
      throw error;
    }

    this.data.chats = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(JSON_SUFFIX))
        .map(async (entry) => {
          const id = entry.name.slice(0, -JSON_SUFFIX.length);
          assertSafeId(id);
          const value: unknown = JSON.parse(
            await readFile(
              join(this.chatsDirectory, entry.name),
              SERVER_FILE_ENCODING,
            ),
          );
          const chat = parseChatFile(value, id);
          if ((value as { version?: unknown }).version !== STORE_VERSION) {
            await this.saveChat(chat);
          }
          return chat;
        }),
    );

    const changed = new Set<StoredChat>();
    for (const chat of this.data.chats) {
      for (const stageKey of stageKeys(chat)) {
        const stage = storedStage(chat, stageKey);
        if (stage && !this.profile(stage.profileId)) {
          stage.profileId = this.data.profileStore.defaultProfileId;
          stage.settingsOverrides = initialOverrides(chat.mode, stageKey);
          stage.profileFallback = true;
          changed.add(chat);
        }
      }
    }
    await Promise.all([...changed].map((chat) => this.saveChat(chat)));
  }

  list(): ChatSummary[] {
    return this.data.chats
      .map(({ id, title, createdAt, updatedAt, mode }) => ({
        id,
        title,
        createdAt,
        updatedAt,
        mode,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(id: string): Chat | null {
    const chat = this.data.chats.find((item) => item.id === id);
    return chat ? this.toChat(chat) : null;
  }

  listProfiles(): ProfileCatalog {
    const { defaultProfileId, profiles } = this.data.profileStore;
    return copy({ defaultProfileId, profiles });
  }

  create(mode: ChatMode = CHAT_MODE.standard): Promise<Chat> {
    return this.change(
      (data) => {
        const now = new Date().toISOString();
        const profile = this.profile(data.profileStore.defaultProfileId);
        if (!profile) throw new Error(SERVER_ERROR_MESSAGES.profileNotFound);
        const stage = (stageKey: ChatStageKey): StoredChatStage => ({
          profileId: profile.id,
          profileFallback: false,
          settingsOverrides: overridesFrom(profile.settings, {
            ...profile.settings,
            ...initialOverrides(mode, stageKey),
          }),
          messages: [],
        });
        const base = {
          id: randomUUID(),
          title: DEFAULT_CHAT_TITLE,
          createdAt: now,
          updatedAt: now,
        };
        const chat: StoredChat =
          mode === CHAT_MODE.translation
            ? {
                ...base,
                mode,
                stages: {
                  generation: stage(CHAT_STAGE.generation),
                  translation: stage(CHAT_STAGE.translation),
                },
              }
            : {
                ...base,
                mode,
                stages: { generation: stage(CHAT_STAGE.generation) },
              };
        data.chats.push(chat);
        return chat;
      },
      (chat) => this.saveChat(chat),
    ).then((chat) => this.toChat(chat));
  }

  createProfile(
    name: string,
    settings: ChatSettings,
  ): Promise<ParameterProfile> {
    return this.change(
      (data) => {
        const profile = { id: randomUUID(), name, settings: copy(settings) };
        data.profileStore.profiles.push(profile);
        return profile;
      },
      () => this.saveProfiles(),
    );
  }

  updateProfile(
    id: string,
    name: string,
    settings: ChatSettings,
  ): Promise<ParameterProfile | null> {
    return this.change(
      () => {
        const profile = this.profile(id);
        if (!profile) return null;
        profile.name = name;
        profile.settings = copy(settings);
        return profile;
      },
      async (profile) => {
        if (profile) await this.saveProfiles();
      },
    );
  }

  deleteProfile(id: string): Promise<ParameterProfile | null> {
    return this.change(
      (data) => {
        const index = data.profileStore.profiles.findIndex(
          (profile) => profile.id === id,
        );
        if (index < 0 || data.profileStore.profiles.length === 1) return null;
        const [deleted] = data.profileStore.profiles.splice(index, 1);
        const fallbackId =
          data.profileStore.defaultProfileId === id
            ? data.profileStore.profiles[0].id
            : data.profileStore.defaultProfileId;
        data.profileStore.defaultProfileId = fallbackId;
        const fallback = this.profile(fallbackId);
        if (!fallback) throw new Error(SERVER_ERROR_MESSAGES.profileNotFound);
        const affected = new Set<StoredChat>();
        for (const chat of data.chats) {
          for (const stageKey of stageKeys(chat)) {
            const stage = storedStage(chat, stageKey);
            if (stage?.profileId !== id) continue;
            const effective = { ...deleted.settings, ...stage.settingsOverrides };
            stage.profileId = fallbackId;
            stage.settingsOverrides = overridesFrom(fallback.settings, effective);
            stage.profileFallback = true;
            affected.add(chat);
          }
        }
        return { deleted, affected: [...affected] };
      },
      async (result) => {
        if (!result) return;
        await this.saveProfiles();
        await Promise.all(result.affected.map((chat) => this.saveChat(chat)));
      },
    ).then((result) => result?.deleted ?? null);
  }

  selectProfile(
    chatId: string,
    stageKey: ChatStageKey,
    profileId: string,
  ): Promise<Chat | null> {
    return this.change(
      (data) => {
        const chat = data.chats.find((item) => item.id === chatId);
        const stage = chat ? storedStage(chat, stageKey) : null;
        if (!chat || !stage || !this.profile(profileId)) return null;
        stage.profileId = profileId;
        stage.profileFallback = false;
        stage.settingsOverrides = {};
        if (stageKey === CHAT_STAGE.generation) {
          data.profileStore.defaultProfileId = profileId;
        }
        return chat;
      },
      async (chat) => {
        if (!chat) return;
        if (stageKey === CHAT_STAGE.generation) await this.saveProfiles();
        await this.saveChat(chat);
      },
    ).then((chat) => (chat ? this.toChat(chat) : null));
  }

  updateChatSettings(
    chatId: string,
    stageKey: ChatStageKey,
    settings: ChatSettings,
  ): Promise<Chat | null> {
    return this.change(
      (data) => {
        const chat = data.chats.find((item) => item.id === chatId);
        const stage = chat ? storedStage(chat, stageKey) : null;
        if (!chat || !stage) return null;
        const profile = this.profile(stage.profileId);
        if (!profile) return null;
        stage.settingsOverrides = overridesFrom(profile.settings, settings);
        stage.profileFallback = false;
        return chat;
      },
      async (chat) => {
        if (chat) await this.saveChat(chat);
      },
    ).then((chat) => (chat ? this.toChat(chat) : null));
  }

  delete(id: string): Promise<boolean> {
    return this.change(
      (data) => {
        const index = data.chats.findIndex((item) => item.id === id);
        if (index < 0) return false;
        data.chats.splice(index, 1);
        return true;
      },
      async (deleted) => {
        if (deleted) await rm(this.chatPath(id), { force: true });
      },
    );
  }

  updateUserMessage(
    chatId: string,
    messageId: string,
    content: string,
  ): Promise<Chat | null> {
    return this.change(
      (data) => {
        const chat = data.chats.find((item) => item.id === chatId);
        const message = chat?.stages.generation.messages.find(
          (item) => item.id === messageId && item.role === MESSAGE_ROLE.user,
        );
        if (!chat || !message) return null;
        message.content = content;
        chat.updatedAt = new Date().toISOString();
        if (
          chat.stages.generation.messages.find(
            (item) => item.role === MESSAGE_ROLE.user,
          )?.id === messageId
        ) {
          chat.title = titleFrom(content);
        }
        return chat;
      },
      async (chat) => {
        if (chat) await this.saveChat(chat);
      },
    ).then((chat) => (chat ? this.toChat(chat) : null));
  }

  deleteTurn(chatId: string, messageId: string): Promise<Chat | null> {
    return this.change(
      (data) => {
        const chat = data.chats.find((item) => item.id === chatId);
        const messages = chat?.stages.generation.messages;
        const messageIndex = messages?.findIndex(
          (item) => item.id === messageId && item.role === MESSAGE_ROLE.user,
        );
        if (!chat || !messages || messageIndex === undefined || messageIndex < 0) {
          return null;
        }
        const assistant = messages[messageIndex + 1];
        messages.splice(
          messageIndex,
          assistant?.role === MESSAGE_ROLE.assistant ? 2 : 1,
        );
        if (
          chat.mode === CHAT_MODE.translation &&
          assistant?.role === MESSAGE_ROLE.assistant
        ) {
          const translationIndex = chat.stages.translation.messages.findIndex(
            (item) => item.sourceMessageId === assistant.id,
          );
          if (translationIndex >= 0) {
            chat.stages.translation.messages.splice(translationIndex, 2);
          }
        }
        chat.updatedAt = new Date().toISOString();
        chat.title = titleFrom(
          messages.find((item) => item.role === MESSAGE_ROLE.user)?.content ??
            "",
        );
        return chat;
      },
      async (chat) => {
        if (chat) await this.saveChat(chat);
      },
    ).then((chat) => (chat ? this.toChat(chat) : null));
  }

  appendTurn(
    id: string,
    stageKey: ChatStageKey,
    user: Message,
    assistant: Message,
  ): Promise<Chat | null> {
    return this.change(
      (data) => {
        const chat = data.chats.find((item) => item.id === id);
        const stage = chat ? storedStage(chat, stageKey) : null;
        if (!chat || !stage) return null;
        stage.messages.push(copy(user), copy(assistant));
        chat.updatedAt = new Date().toISOString();
        if (
          stageKey === CHAT_STAGE.generation &&
          chat.title === DEFAULT_CHAT_TITLE
        ) {
          chat.title = titleFrom(user.content);
        }
        return chat;
      },
      async (chat) => {
        if (chat) await this.saveChat(chat);
      },
    ).then((chat) => (chat ? this.toChat(chat) : null));
  }

  upsertTranslationTurn(
    id: string,
    sourceMessageId: string,
    user: Message,
    assistant: Message,
  ): Promise<Chat | null> {
    return this.change(
      (data) => {
        const chat = data.chats.find((item) => item.id === id);
        if (chat?.mode !== CHAT_MODE.translation) return null;
        const sourceExists = chat.stages.generation.messages.some(
          (message) =>
            message.id === sourceMessageId &&
            message.role === MESSAGE_ROLE.assistant,
        );
        if (!sourceExists || user.sourceMessageId !== sourceMessageId) return null;

        const translations = chat.stages.translation.messages;
        const existing = translations.findIndex(
          (message) => message.sourceMessageId === sourceMessageId,
        );
        if (existing >= 0) {
          translations.splice(existing, 2, copy(user), copy(assistant));
        } else {
          const sourceOrder = generationAssistantIds(chat).indexOf(sourceMessageId);
          let insertion = translations.length;
          for (let index = 0; index < translations.length; index += 2) {
            const existingSource = translations[index]?.sourceMessageId;
            if (
              existingSource &&
              generationAssistantIds(chat).indexOf(existingSource) > sourceOrder
            ) {
              insertion = index;
              break;
            }
          }
          translations.splice(insertion, 0, copy(user), copy(assistant));
        }
        chat.updatedAt = new Date().toISOString();
        return chat;
      },
      async (chat) => {
        if (chat) await this.saveChat(chat);
      },
    ).then((chat) => (chat ? this.toChat(chat) : null));
  }

  private change<T>(
    mutate: (data: RepositoryData) => T,
    persist: (result: T) => Promise<void>,
  ): Promise<T> {
    const run = this.writeQueue.then(async () => {
      const before = copy(this.data);
      const result = mutate(this.data);
      try {
        await persist(result);
      } catch (error) {
        this.data = before;
        throw error;
      }
      return copy(result);
    });
    this.writeQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async loadProfiles() {
    try {
      const value: unknown = JSON.parse(
        await readFile(this.profilesPath, SERVER_FILE_ENCODING),
      );
      this.data.profileStore = parseProfileStore(value);
      if ((value as { version?: unknown }).version !== STORE_VERSION) {
        await this.saveProfiles();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== FILE_NOT_FOUND_CODE) {
        throw error;
      }
      await this.saveProfiles();
    }
  }

  private profile(id: string) {
    return this.data.profileStore.profiles.find((profile) => profile.id === id);
  }

  private toChat(chat: StoredChat): Chat {
    const base = {
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    };
    if (chat.mode === CHAT_MODE.translation) {
      return copy({
        ...base,
        mode: chat.mode,
        stages: {
          generation: this.toChatStage(chat.stages.generation),
          translation: this.toChatStage(chat.stages.translation),
        },
      });
    }
    return copy({
      ...base,
      mode: chat.mode,
      stages: { generation: this.toChatStage(chat.stages.generation) },
    });
  }

  private toChatStage(stage: StoredChatStage): ChatStage {
    const profile = this.profile(stage.profileId);
    if (!profile) throw new Error(SERVER_ERROR_MESSAGES.profileNotFound);
    return {
      profileId: stage.profileId,
      profileFallback: stage.profileFallback,
      settings: { ...profile.settings, ...stage.settingsOverrides },
      messages: copy(stage.messages),
    };
  }

  private saveProfiles() {
    return this.writeJson(this.profilesPath, this.data.profileStore);
  }

  private saveChat(chat: StoredChat) {
    return this.writeJson(this.chatPath(chat.id), {
      version: STORE_VERSION,
      chat,
    });
  }

  private chatPath(id: string) {
    assertSafeId(id);
    return join(this.chatsDirectory, `${id}${JSON_SUFFIX}`);
  }

  private async writeJson(filePath: string, value: unknown) {
    await mkdir(dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
        encoding: SERVER_FILE_ENCODING,
        mode: 0o600,
      });
      await rename(temporary, filePath);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}

function stageKeys(chat: StoredChat): ChatStageKey[] {
  return chat.mode === CHAT_MODE.translation
    ? [CHAT_STAGE.generation, CHAT_STAGE.translation]
    : [CHAT_STAGE.generation];
}

function storedStage(
  chat: StoredChat,
  stage: ChatStageKey,
): StoredChatStage | null {
  if (stage === CHAT_STAGE.generation) return chat.stages.generation;
  return chat.mode === CHAT_MODE.translation ? chat.stages.translation : null;
}

function initialOverrides(
  mode: ChatMode,
  stage: ChatStageKey,
): ChatSettingsOverrides {
  if (mode !== CHAT_MODE.translation) return {};
  return {
    systemPrompt:
      stage === CHAT_STAGE.generation
        ? DEFAULT_GENERATION_SYSTEM_PROMPT
        : DEFAULT_TRANSLATION_SYSTEM_PROMPT,
  };
}

function overridesFrom(
  defaults: ChatSettings,
  settings: ChatSettings,
): ChatSettingsOverrides {
  const overrides: ChatSettingsOverrides = {};
  for (const key of CHAT_SETTING_KEYS) {
    if (settings[key] !== defaults[key]) {
      Object.assign(overrides, { [key]: settings[key] });
    }
  }
  return overrides;
}

function generationAssistantIds(chat: StoredChat): string[] {
  return chat.stages.generation.messages
    .filter((message) => message.role === MESSAGE_ROLE.assistant)
    .map((message) => message.id);
}

function assertSafeId(id: string) {
  if (!SAFE_ID.test(id)) throw new Error(SERVER_ERROR_MESSAGES.invalidId);
}

function titleFrom(content: string) {
  return (
    content.replace(/\s+/g, " ").trim().slice(0, CHAT_LIMITS.title) ||
    DEFAULT_CHAT_TITLE
  );
}
