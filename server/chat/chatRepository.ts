import type {
  Chat,
  ChatParameters,
  ChatSettings,
  ChatSummary,
  Message,
  ParameterProfile,
  ProfileCatalog,
} from "../../shared/types/chat.ts";

export interface ChatRepository {
  list(): ChatSummary[];
  get(id: string): Chat | null;
  listProfiles(): ProfileCatalog;
  create(): Promise<Chat>;
  createProfile(
    name: string,
    settings: ChatSettings,
  ): Promise<ParameterProfile>;
  updateProfile(
    id: string,
    name: string,
    settings: ChatSettings,
  ): Promise<ParameterProfile | null>;
  deleteProfile(id: string): Promise<ParameterProfile | null>;
  selectProfile(chatId: string, profileId: string): Promise<Chat | null>;
  updateChatParameters(
    chatId: string,
    parameters: ChatParameters,
  ): Promise<Chat | null>;
  delete(id: string): Promise<boolean>;
  updateUserMessage(
    chatId: string,
    messageId: string,
    content: string,
  ): Promise<Chat | null>;
  deleteTurn(chatId: string, messageId: string): Promise<Chat | null>;
  appendTurn(
    id: string,
    user: Message,
    assistant: Message,
  ): Promise<Chat | null>;
}
