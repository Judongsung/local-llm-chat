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
  ChatParameters,
  ChatSettings,
  ChatSettingsOverrides,
  ChatSummary,
  Message,
  ParameterProfile,
  ProfileCatalog,
} from "../../../shared/types/chat.ts";
import {
  CHAT_LIMITS,
  DEFAULT_CHAT_TITLE,
  DEFAULT_PROFILE_NAME,
  STORE_VERSION,
} from "../../../shared/constants/chat.ts";
import type { ChatRepository } from "../chatRepository.ts";
import {
  parseChatFile,
  parseProfileStore,
  type ProfileStore,
  type StoredChat,
} from "./storeSchema.ts";

const CHATS_DIRECTORY = "chats";
const PROFILES_FILE = "profiles.json";
const JSON_SUFFIX = ".json";
const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const PARAMETER_KEYS = [
  "model",
  "temperature",
  "topP",
  "maxTokens",
  "reasoningEffort",
] as const;
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
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }

    this.data.chats = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(JSON_SUFFIX))
        .map(async (entry) => {
          const id = entry.name.slice(0, -JSON_SUFFIX.length);
          assertSafeId(id);
          const value: unknown = JSON.parse(
            await readFile(join(this.chatsDirectory, entry.name), "utf8"),
          );
          return parseChatFile(value, id);
        }),
    );

    const missing = this.data.chats.filter(
      (chat) => !this.profile(chat.profileId),
    );
    for (const chat of missing) {
      chat.profileId = this.data.profileStore.defaultProfileId;
      chat.settingsOverrides = {};
      chat.profileFallback = true;
    }
    await Promise.all(missing.map((chat) => this.saveChat(chat)));
  }

  list(): ChatSummary[] {
    return this.data.chats
      .map(({ id, title, createdAt, updatedAt }) => ({
        id,
        title,
        createdAt,
        updatedAt,
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

  create(): Promise<Chat> {
    return this.change(
      (data) => {
        const now = new Date().toISOString();
        const chat: StoredChat = {
          id: randomUUID(),
          title: DEFAULT_CHAT_TITLE,
          createdAt: now,
          updatedAt: now,
          profileId: data.profileStore.defaultProfileId,
          profileFallback: false,
          settingsOverrides: {},
          messages: [],
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
        const fallback =
          data.profileStore.defaultProfileId === id
            ? data.profileStore.profiles[0].id
            : data.profileStore.defaultProfileId;
        data.profileStore.defaultProfileId = fallback;
        const affected = data.chats.filter((chat) => chat.profileId === id);
        affected.forEach((chat) => {
          chat.profileId = fallback;
          chat.settingsOverrides = {};
          chat.profileFallback = true;
        });
        return { deleted, affected };
      },
      async (result) => {
        if (!result) return;
        await this.saveProfiles();
        await Promise.all(result.affected.map((chat) => this.saveChat(chat)));
      },
    ).then((result) => result?.deleted ?? null);
  }

  selectProfile(chatId: string, profileId: string): Promise<Chat | null> {
    return this.change(
      (data) => {
        const chat = data.chats.find((item) => item.id === chatId);
        if (!chat || !this.profile(profileId)) return null;
        chat.profileId = profileId;
        chat.profileFallback = false;
        chat.settingsOverrides = {};
        data.profileStore.defaultProfileId = profileId;
        return chat;
      },
      async (chat) => {
        if (!chat) return;
        await this.saveProfiles();
        await this.saveChat(chat);
      },
    ).then((chat) => (chat ? this.toChat(chat) : null));
  }

  updateChatParameters(
    chatId: string,
    parameters: ChatParameters,
  ): Promise<Chat | null> {
    return this.change(
      (data) => {
        const chat = data.chats.find((item) => item.id === chatId);
        if (!chat) return null;
        const profile = this.profile(chat.profileId);
        if (!profile) return null;
        chat.settingsOverrides = overridesFrom(profile.settings, parameters);
        chat.profileFallback = false;
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
        const message = chat?.messages.find(
          (item) => item.id === messageId && item.role === "user",
        );
        if (!chat || !message) return null;
        message.content = content;
        chat.updatedAt = new Date().toISOString();
        if (
          chat.messages.find((item) => item.role === "user")?.id === messageId
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
        const messageIndex = chat?.messages.findIndex(
          (item) => item.id === messageId && item.role === "user",
        );
        if (!chat || messageIndex === undefined || messageIndex < 0) return null;
        const followingMessage = chat.messages[messageIndex + 1];
        chat.messages.splice(
          messageIndex,
          followingMessage?.role === "assistant" ? 2 : 1,
        );
        chat.updatedAt = new Date().toISOString();
        chat.title = titleFrom(
          chat.messages.find((item) => item.role === "user")?.content ?? "",
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
    user: Message,
    assistant: Message,
  ): Promise<Chat | null> {
    return this.change(
      (data) => {
        const chat = data.chats.find((item) => item.id === id);
        if (!chat) return null;
        chat.messages.push(copy(user), copy(assistant));
        chat.updatedAt = new Date().toISOString();
        if (chat.title === DEFAULT_CHAT_TITLE) {
          chat.title = titleFrom(user.content);
        }
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
        await readFile(this.profilesPath, "utf8"),
      );
      this.data.profileStore = parseProfileStore(value);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await this.saveProfiles();
    }
  }

  private profile(id: string) {
    return this.data.profileStore.profiles.find((profile) => profile.id === id);
  }

  private toChat(chat: StoredChat): Chat {
    const profile = this.profile(chat.profileId);
    if (!profile) throw new Error("채팅 프로필을 찾을 수 없습니다.");
    const { settingsOverrides: overrides, ...stored } = chat;
    return copy({
      ...stored,
      settings: { ...profile.settings, ...overrides },
    });
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
        encoding: "utf8",
        mode: 0o600,
      });
      await rename(temporary, filePath);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}

function overridesFrom(
  defaults: ChatSettings,
  parameters: ChatParameters,
): ChatSettingsOverrides {
  const overrides: ChatSettingsOverrides = {};
  for (const key of PARAMETER_KEYS) {
    if (parameters[key] !== defaults[key]) {
      Object.assign(overrides, { [key]: parameters[key] });
    }
  }
  return overrides;
}

function assertSafeId(id: string) {
  if (!SAFE_ID.test(id)) throw new Error("ID 형식이 올바르지 않습니다.");
}

function titleFrom(content: string) {
  return (
    content.replace(/\s+/g, " ").trim().slice(0, CHAT_LIMITS.title) ||
    DEFAULT_CHAT_TITLE
  );
}
