import { randomUUID } from "node:crypto";
import type {
  Chat,
  ChatMode,
  ChatSettings,
  ChatStage,
  ChatStageKey,
  ChatSummary,
  ImageAttachment,
  Message,
  MessageInput,
  ParameterProfile,
  ProfileCatalog,
  StreamEvent,
} from "../../shared/types/chat.ts";
import {
  CHAT_MODE,
  CHAT_STAGE,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  STREAM_EVENT,
} from "../../shared/constants/chat.ts";
import { SERVER_ERROR_MESSAGES } from "../../shared/constants/serverText.ko.ts";
import { applicationError } from "../errors/applicationError.ts";
import {
  COMPLETION_CHUNK_TYPE,
  type CompletionStreamer,
} from "../llm/completionStreamer.ts";
import type { ChatRepository } from "./chatRepository.ts";

type StageResult = { assistant: Message; chat: Chat };

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

  createChat(mode: ChatMode = CHAT_MODE.standard): Promise<Chat> {
    return this.repository.create(mode);
  }

  getChat(id: string): Chat {
    const chat = this.repository.get(id);
    if (!chat) {
      throw applicationError.notFound(SERVER_ERROR_MESSAGES.chatNotFound);
    }
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
      throw applicationError.notFound(SERVER_ERROR_MESSAGES.profileNotFound);
    }
    return profile;
  }

  async deleteProfile(id: string): Promise<void> {
    const catalog = this.repository.listProfiles();
    if (!catalog.profiles.some((profile) => profile.id === id)) {
      throw applicationError.notFound(SERVER_ERROR_MESSAGES.profileNotFound);
    }
    if (catalog.profiles.length === 1) {
      throw applicationError.conflict(SERVER_ERROR_MESSAGES.lastProfile);
    }
    await this.repository.deleteProfile(id);
  }

  async selectProfile(
    chatId: string,
    stage: ChatStageKey,
    profileId: string,
  ): Promise<Chat> {
    this.ensureIdle(chatId, SERVER_ERROR_MESSAGES.busyProfile);
    this.ensureStage(this.getChat(chatId), stage);
    if (
      !this.repository
        .listProfiles()
        .profiles.some((profile) => profile.id === profileId)
    ) {
      throw applicationError.notFound(SERVER_ERROR_MESSAGES.profileNotFound);
    }
    const chat = await this.repository.selectProfile(chatId, stage, profileId);
    if (!chat) {
      throw applicationError.notFound(SERVER_ERROR_MESSAGES.chatNotFound);
    }
    return chat;
  }

  async updateChatSettings(
    chatId: string,
    stage: ChatStageKey,
    settings: ChatSettings,
  ): Promise<Chat> {
    this.ensureIdle(chatId, SERVER_ERROR_MESSAGES.busySettings);
    this.ensureStage(this.getChat(chatId), stage);
    const chat = await this.repository.updateChatSettings(
      chatId,
      stage,
      settings,
    );
    if (!chat) {
      throw applicationError.notFound(SERVER_ERROR_MESSAGES.chatNotFound);
    }
    return chat;
  }

  async deleteChat(id: string): Promise<void> {
    if (this.activeChats.has(id)) {
      throw applicationError.conflict(SERVER_ERROR_MESSAGES.busyDelete);
    }
    if (!(await this.repository.delete(id))) {
      throw applicationError.notFound(SERVER_ERROR_MESSAGES.chatNotFound);
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
    if (!chat) {
      throw applicationError.notFound(SERVER_ERROR_MESSAGES.messageNotFound);
    }
    return chat;
  }

  async deleteTurn(chatId: string, messageId: string): Promise<Chat> {
    this.ensureIdle(chatId, SERVER_ERROR_MESSAGES.busyDelete);
    const chat = await this.repository.deleteTurn(chatId, messageId);
    if (!chat) {
      throw applicationError.notFound(SERVER_ERROR_MESSAGES.messageNotFound);
    }
    return chat;
  }

  streamMessage(
    chatId: string,
    input: MessageInput,
    signal: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    const chat = this.getChat(chatId);
    this.begin(chatId);
    return this.generate(chat.mode, chatId, input, signal);
  }

  retryTranslation(
    chatId: string,
    sourceMessageId: string,
    signal: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    const chat = this.getChat(chatId);
    if (chat.mode !== CHAT_MODE.translation) {
      throw applicationError.notFound(
        SERVER_ERROR_MESSAGES.translationNotAvailable,
      );
    }
    const source = chat.stages.generation.messages.find(
      (message) =>
        message.id === sourceMessageId &&
        message.role === MESSAGE_ROLE.assistant &&
        message.status === MESSAGE_STATUS.complete &&
        Boolean(message.content),
    );
    if (!source) {
      throw applicationError.notFound(
        SERVER_ERROR_MESSAGES.translationNotAvailable,
      );
    }
    const existingIndex = chat.stages.translation.messages.findIndex(
      (message) => message.sourceMessageId === sourceMessageId,
    );
    if (
      existingIndex >= 0 &&
      chat.stages.translation.messages[existingIndex + 1]?.status ===
        MESSAGE_STATUS.complete
    ) {
      throw applicationError.conflict(
        SERVER_ERROR_MESSAGES.translationComplete,
      );
    }
    this.begin(chatId);
    return this.translateOnly(chatId, source, signal);
  }

  private async *generate(
    mode: ChatMode,
    chatId: string,
    input: MessageInput,
    signal: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    try {
      const generated = yield* this.runStage(
        chatId,
        CHAT_STAGE.generation,
        input.content,
        input.attachments,
        signal,
      );
      if (!generated) return;
      if (mode === CHAT_MODE.standard) {
        yield { type: STREAM_EVENT.done, chat: generated.chat };
        return;
      }

      const translated = yield* this.runStage(
        chatId,
        CHAT_STAGE.translation,
        generated.assistant.content,
        [],
        signal,
        generated.assistant.id,
      );
      if (translated) yield { type: STREAM_EVENT.done, chat: translated.chat };
    } finally {
      this.activeChats.delete(chatId);
    }
  }

  private async *translateOnly(
    chatId: string,
    source: Message,
    signal: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    try {
      const translated = yield* this.runStage(
        chatId,
        CHAT_STAGE.translation,
        source.content,
        [],
        signal,
        source.id,
      );
      if (translated) yield { type: STREAM_EVENT.done, chat: translated.chat };
    } finally {
      this.activeChats.delete(chatId);
    }
  }

  private async *runStage(
    chatId: string,
    stageKey: ChatStageKey,
    prompt: string,
    attachments: ImageAttachment[],
    signal: AbortSignal,
    sourceMessageId?: string,
  ): AsyncGenerator<StreamEvent, StageResult | null> {
    const chat = this.getChat(chatId);
    const stage = this.ensureStage(chat, stageKey);
    const now = new Date().toISOString();
    const user: Message = {
      id: randomUUID(),
      role: MESSAGE_ROLE.user,
      content: prompt,
      ...(sourceMessageId ? { sourceMessageId } : {}),
      ...(attachments.length ? { attachments } : {}),
      createdAt: now,
      status: MESSAGE_STATUS.complete,
    };
    const assistant: Message = {
      id: randomUUID(),
      role: MESSAGE_ROLE.assistant,
      content: "",
      createdAt: now,
      status: MESSAGE_STATUS.complete,
    };

    yield {
      type: STREAM_EVENT.start,
      stage: stageKey,
      userMessageId: user.id,
      assistantMessageId: assistant.id,
      ...(sourceMessageId ? { sourceMessageId } : {}),
    };

    try {
      for await (const delta of this.completionStreamer(
        {
          history: historyWithoutSource(stage, sourceMessageId),
          prompt,
          attachments,
          settings: stage.settings,
        },
        signal,
      )) {
        if (delta.type === COMPLETION_CHUNK_TYPE.reasoning) {
          assistant.reasoning = (assistant.reasoning ?? "") + delta.text;
          yield {
            type: STREAM_EVENT.reasoningDelta,
            stage: stageKey,
            text: delta.text,
          };
        } else {
          assistant.content += delta.text;
          yield { type: STREAM_EVENT.delta, stage: stageKey, text: delta.text };
        }
      }
      if (!assistant.content) {
        throw new Error(SERVER_ERROR_MESSAGES.emptyLlmResponse);
      }

      const saved = await this.saveStageTurn(
        chatId,
        stageKey,
        user,
        assistant,
        sourceMessageId,
      );
      if (!saved) {
        throw applicationError.notFound(SERVER_ERROR_MESSAGES.chatDeleted);
      }
      return { assistant, chat: saved };
    } catch (error) {
      const aborted = signal.aborted;
      if (assistant.content || assistant.reasoning) {
        assistant.status = aborted
          ? MESSAGE_STATUS.stopped
          : MESSAGE_STATUS.error;
        try {
          await this.saveStageTurn(
            chatId,
            stageKey,
            user,
            assistant,
            sourceMessageId,
          );
        } catch {
          // 오류 응답에는 저장소에서 확인 가능한 마지막 상태를 반환한다.
        }
      }
      yield {
        type: STREAM_EVENT.error,
        stage: stageKey,
        message: aborted ? SERVER_ERROR_MESSAGES.stopped : safeMessage(error),
        chat: this.getChat(chatId),
      };
      return null;
    }
  }

  private saveStageTurn(
    chatId: string,
    stage: ChatStageKey,
    user: Message,
    assistant: Message,
    sourceMessageId?: string,
  ) {
    return stage === CHAT_STAGE.translation && sourceMessageId
      ? this.repository.upsertTranslationTurn(
          chatId,
          sourceMessageId,
          user,
          assistant,
        )
      : this.repository.appendTurn(chatId, stage, user, assistant);
  }

  private begin(chatId: string) {
    if (this.activeChats.has(chatId)) {
      throw applicationError.conflict(SERVER_ERROR_MESSAGES.busy);
    }
    this.activeChats.add(chatId);
  }

  private ensureIdle(chatId: string, message: string) {
    if (this.activeChats.has(chatId)) {
      throw applicationError.conflict(message);
    }
  }

  private ensureStage(chat: Chat, stage: ChatStageKey): ChatStage {
    if (stage === CHAT_STAGE.generation) return chat.stages.generation;
    if (chat.mode === CHAT_MODE.translation) return chat.stages.translation;
    throw applicationError.notFound(SERVER_ERROR_MESSAGES.invalidChatStage);
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
      throw applicationError.conflict(
        SERVER_ERROR_MESSAGES.duplicateProfileName,
      );
    }
  }
}

function historyWithoutSource(
  stage: ChatStage,
  sourceMessageId?: string,
): Message[] {
  if (!sourceMessageId) return stage.messages;
  const index = stage.messages.findIndex(
    (message) => message.sourceMessageId === sourceMessageId,
  );
  return index < 0
    ? stage.messages
    : [...stage.messages.slice(0, index), ...stage.messages.slice(index + 2)];
}

const safeMessage = (error: unknown) =>
  error instanceof Error ? error.message : SERVER_ERROR_MESSAGES.llmRequestFailed;
