import { randomUUID } from "node:crypto";
import type {
  Chat,
  ChatParameters,
  ChatSettings,
  ChatSummary,
  Message,
  MessageInput,
  ParameterProfile,
  ProfileCatalog,
  StreamEvent,
} from "../../shared/types/chat.ts";
import { SERVER_ERROR_MESSAGES } from "../../shared/constants/server.ts";
import type { CompletionStreamer } from "../llm/completionStreamer.ts";
import type { ChatRepository } from "./chatRepository.ts";

export class ChatNotFoundError extends Error {}
export class ChatBusyError extends Error {}
export class ProfileConflictError extends Error {}

export class ChatService {
  private readonly activeChats = new Set<string>();
  private readonly repository: ChatRepository;
  private readonly completionStreamer: CompletionStreamer;

  constructor(
    repository: ChatRepository,
    completionStreamer: CompletionStreamer,
  ) {
    this.repository = repository;
    this.completionStreamer = completionStreamer;
  }

  listChats(): ChatSummary[] {
    return this.repository.list();
  }

  createChat(): Promise<Chat> {
    return this.repository.create();
  }

  getChat(id: string): Chat {
    const chat = this.repository.get(id);
    if (!chat) throw new ChatNotFoundError(SERVER_ERROR_MESSAGES.chatNotFound);
    return chat;
  }

  listProfiles(): ProfileCatalog {
    return this.repository.listProfiles();
  }

  createProfile(
    name: string,
    settings: ChatSettings,
  ): Promise<ParameterProfile> {
    this.ensureUniqueProfileName(name);
    return this.repository.createProfile(name, settings);
  }

  async updateProfile(
    id: string,
    name: string,
    settings: ChatSettings,
  ): Promise<ParameterProfile> {
    this.ensureUniqueProfileName(name, id);
    const profile = await this.repository.updateProfile(id, name, settings);
    if (!profile) {
      throw new ChatNotFoundError(SERVER_ERROR_MESSAGES.profileNotFound);
    }
    return profile;
  }

  async deleteProfile(id: string): Promise<void> {
    const catalog = this.repository.listProfiles();
    if (!catalog.profiles.some((profile) => profile.id === id)) {
      throw new ChatNotFoundError(SERVER_ERROR_MESSAGES.profileNotFound);
    }
    if (catalog.profiles.length === 1) {
      throw new ProfileConflictError(SERVER_ERROR_MESSAGES.lastProfile);
    }
    await this.repository.deleteProfile(id);
  }

  async selectProfile(chatId: string, profileId: string): Promise<Chat> {
    this.ensureIdle(chatId, SERVER_ERROR_MESSAGES.busyProfile);
    if (!this.repository.listProfiles().profiles.some(
      (profile) => profile.id === profileId,
    )) {
      throw new ChatNotFoundError(SERVER_ERROR_MESSAGES.profileNotFound);
    }
    const chat = await this.repository.selectProfile(chatId, profileId);
    if (!chat) throw new ChatNotFoundError(SERVER_ERROR_MESSAGES.chatNotFound);
    return chat;
  }

  async updateChatParameters(
    chatId: string,
    parameters: ChatParameters,
  ): Promise<Chat> {
    this.ensureIdle(chatId, SERVER_ERROR_MESSAGES.busySettings);
    const chat = await this.repository.updateChatParameters(chatId, parameters);
    if (!chat) throw new ChatNotFoundError(SERVER_ERROR_MESSAGES.chatNotFound);
    return chat;
  }

  async deleteChat(id: string): Promise<void> {
    if (this.activeChats.has(id)) {
      throw new ChatBusyError(SERVER_ERROR_MESSAGES.busyDelete);
    }
    if (!(await this.repository.delete(id))) {
      throw new ChatNotFoundError(SERVER_ERROR_MESSAGES.chatNotFound);
    }
  }

  async updateUserMessage(
    chatId: string,
    messageId: string,
    content: string,
  ): Promise<Chat> {
    this.ensureIdle(chatId, SERVER_ERROR_MESSAGES.busyEdit);
    const chat = await this.repository.updateUserMessage(
      chatId,
      messageId,
      content,
    );
    if (!chat) throw new ChatNotFoundError(SERVER_ERROR_MESSAGES.messageNotFound);
    return chat;
  }

  async deleteTurn(chatId: string, messageId: string): Promise<Chat> {
    this.ensureIdle(chatId, SERVER_ERROR_MESSAGES.busyDelete);
    const chat = await this.repository.deleteTurn(chatId, messageId);
    if (!chat) throw new ChatNotFoundError(SERVER_ERROR_MESSAGES.messageNotFound);
    return chat;
  }

  streamMessage(
    chatId: string,
    input: MessageInput,
    signal: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    const chat = this.repository.get(chatId);
    if (!chat) throw new ChatNotFoundError(SERVER_ERROR_MESSAGES.chatNotFound);
    if (this.activeChats.has(chatId)) {
      throw new ChatBusyError(SERVER_ERROR_MESSAGES.busy);
    }
    this.activeChats.add(chatId);
    return this.generate(chat, input, signal);
  }

  private async *generate(
    chat: Chat,
    input: MessageInput,
    signal: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    const chatId = chat.id;
    const now = new Date().toISOString();
    const user: Message = {
      id: randomUUID(),
      role: "user",
      content: input.content,
      ...(input.attachments.length ? { attachments: input.attachments } : {}),
      createdAt: now,
      status: "complete",
    };
    const assistant: Message = {
      id: randomUUID(),
      role: "assistant",
      content: "",
      createdAt: now,
      status: "complete",
    };

    yield {
      type: "start",
      userMessageId: user.id,
      assistantMessageId: assistant.id,
    };

    try {
      for await (const delta of this.completionStreamer(
        {
          history: chat.messages,
          prompt: input.content,
          attachments: input.attachments,
          settings: chat.settings,
        },
        signal,
      )) {
        if (delta.type === "reasoning") {
          assistant.reasoning = (assistant.reasoning ?? "") + delta.text;
          yield { type: "reasoning_delta", text: delta.text };
        } else {
          assistant.content += delta.text;
          yield { type: "delta", text: delta.text };
        }
      }
      if (!assistant.content && !assistant.reasoning) {
        throw new Error(SERVER_ERROR_MESSAGES.emptyLlmResponse);
      }

      const saved = await this.repository.appendTurn(chatId, user, assistant);
      if (!saved) throw new ChatNotFoundError(SERVER_ERROR_MESSAGES.chatDeleted);
      yield { type: "done", chat: saved };
    } catch (error) {
      const aborted = signal.aborted;
      let partialSaved = false;
      if (assistant.content || assistant.reasoning) {
        assistant.status = aborted ? "stopped" : "error";
        try {
          partialSaved = Boolean(
            await this.repository.appendTurn(chatId, user, assistant),
          );
        } catch {
          partialSaved = false;
        }
      }
      yield {
        type: "error",
        message: aborted ? SERVER_ERROR_MESSAGES.stopped : safeMessage(error),
        partialSaved,
      };
    } finally {
      this.activeChats.delete(chatId);
    }
  }

  private ensureIdle(chatId: string, message: string) {
    if (this.activeChats.has(chatId)) throw new ChatBusyError(message);
  }

  private ensureUniqueProfileName(name: string, exceptId?: string) {
    const normalized = name.toLocaleLowerCase();
    if (
      this.repository
        .listProfiles()
        .profiles.some(
          (profile) =>
            profile.id !== exceptId &&
            profile.name.toLocaleLowerCase() === normalized,
        )
    ) {
      throw new ProfileConflictError(SERVER_ERROR_MESSAGES.duplicateProfileName);
    }
  }
}

const safeMessage = (error: unknown) =>
  error instanceof Error ? error.message : SERVER_ERROR_MESSAGES.llmRequestFailed;
