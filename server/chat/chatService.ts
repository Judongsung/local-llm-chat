import { randomUUID } from "node:crypto";
import type {
  Chat,
  ChatParameters,
  ChatSettings,
  ChatSummary,
  Message,
  ParameterProfile,
  ProfileCatalog,
  StreamEvent,
} from "../../shared/types/chat.ts";
import type { CompletionStreamer } from "../llm/completionStreamer.ts";
import type { ChatRepository } from "./chatRepository.ts";
import type { MessageInput } from "./chatValidation.ts";

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
    if (!chat) throw new ChatNotFoundError("대화를 찾을 수 없습니다.");
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
    if (!profile) throw new ChatNotFoundError("프로필을 찾을 수 없습니다.");
    return profile;
  }

  async deleteProfile(id: string): Promise<void> {
    const catalog = this.repository.listProfiles();
    if (!catalog.profiles.some((profile) => profile.id === id)) {
      throw new ChatNotFoundError("프로필을 찾을 수 없습니다.");
    }
    if (catalog.profiles.length === 1) {
      throw new ProfileConflictError("마지막 프로필은 삭제할 수 없습니다.");
    }
    await this.repository.deleteProfile(id);
  }

  async selectProfile(chatId: string, profileId: string): Promise<Chat> {
    this.ensureIdle(chatId, "응답 생성 중에는 프로필을 변경할 수 없습니다.");
    if (!this.repository.listProfiles().profiles.some(
      (profile) => profile.id === profileId,
    )) {
      throw new ChatNotFoundError("프로필을 찾을 수 없습니다.");
    }
    const chat = await this.repository.selectProfile(chatId, profileId);
    if (!chat) throw new ChatNotFoundError("대화를 찾을 수 없습니다.");
    return chat;
  }

  async updateChatParameters(
    chatId: string,
    parameters: ChatParameters,
  ): Promise<Chat> {
    this.ensureIdle(chatId, "응답 생성 중에는 설정을 변경할 수 없습니다.");
    const chat = await this.repository.updateChatParameters(chatId, parameters);
    if (!chat) throw new ChatNotFoundError("대화를 찾을 수 없습니다.");
    return chat;
  }

  async deleteChat(id: string): Promise<void> {
    if (this.activeChats.has(id)) {
      throw new ChatBusyError("응답 생성 중에는 삭제할 수 없습니다.");
    }
    if (!(await this.repository.delete(id))) {
      throw new ChatNotFoundError("대화를 찾을 수 없습니다.");
    }
  }

  async updateUserMessage(
    chatId: string,
    messageId: string,
    content: string,
  ): Promise<Chat> {
    this.ensureIdle(chatId, "응답 생성 중에는 수정할 수 없습니다.");
    const chat = await this.repository.updateUserMessage(
      chatId,
      messageId,
      content,
    );
    if (!chat) throw new ChatNotFoundError("메시지를 찾을 수 없습니다.");
    return chat;
  }

  async deleteTurn(chatId: string, messageId: string): Promise<Chat> {
    this.ensureIdle(chatId, "응답 생성 중에는 삭제할 수 없습니다.");
    const chat = await this.repository.deleteTurn(chatId, messageId);
    if (!chat) throw new ChatNotFoundError("메시지를 찾을 수 없습니다.");
    return chat;
  }

  streamMessage(
    chatId: string,
    input: MessageInput,
    signal: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    const chat = this.repository.get(chatId);
    if (!chat) throw new ChatNotFoundError("대화를 찾을 수 없습니다.");
    if (this.activeChats.has(chatId)) {
      throw new ChatBusyError("이미 응답을 생성하고 있습니다.");
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
        throw new Error("LLM API가 빈 응답을 반환했습니다.");
      }

      const saved = await this.repository.appendTurn(chatId, user, assistant);
      if (!saved) throw new ChatNotFoundError("대화가 삭제되었습니다.");
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
        message: aborted ? "응답 생성을 중단했습니다." : safeMessage(error),
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
      throw new ProfileConflictError("같은 이름의 프로필이 이미 있습니다.");
    }
  }
}

const safeMessage = (error: unknown) =>
  error instanceof Error ? error.message : "LLM 요청에 실패했습니다.";
