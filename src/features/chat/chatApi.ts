import type {
  Chat,
  ChatParameters,
  ChatSettings,
  ChatSummary,
  ImageAttachment,
  ParameterProfile,
  ProfileCatalog,
  StreamEvent,
} from "../../../shared/types/chat.ts";
import {
  HTTP_METHODS,
  HTTP_STATUS,
  JSON_HEADERS,
  SSE,
} from "../../../shared/constants/http.ts";
import { UI_TEXT } from "../../constants/ui.ts";
import { formatRequestFailedMessage } from "../../utils/formatUiText.ts";

const API_PATHS = {
  chats: "/api/chats",
  models: "/api/models",
  profiles: "/api/profiles",
} as const;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      body?.error || formatRequestFailedMessage(response.status),
    );
  }
  return (
    response.status === HTTP_STATUS.noContent
      ? undefined
      : await response.json()
  ) as T;
}

export const listChats = () => request<ChatSummary[]>(API_PATHS.chats);

export const listModels = () => request<string[]>(API_PATHS.models);

export const createChat = () =>
  request<Chat>(API_PATHS.chats, { method: HTTP_METHODS.create });

export const getChat = (id: string) =>
  request<Chat>(`${API_PATHS.chats}/${id}`);

export const listProfiles = () =>
  request<ProfileCatalog>(API_PATHS.profiles);

export const createProfile = (name: string, settings: ChatSettings) =>
  request<ParameterProfile>(API_PATHS.profiles, {
    method: HTTP_METHODS.create,
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, ...settings }),
  });

export const updateProfile = (
  id: string,
  name: string,
  settings: ChatSettings,
) =>
  request<ParameterProfile>(`${API_PATHS.profiles}/${id}`, {
    method: HTTP_METHODS.update,
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, ...settings }),
  });

export const deleteProfile = (id: string) =>
  request<void>(`${API_PATHS.profiles}/${id}`, {
    method: HTTP_METHODS.delete,
  });

export const selectProfile = (chatId: string, profileId: string) =>
  request<Chat>(`${API_PATHS.chats}/${chatId}/profile`, {
    method: HTTP_METHODS.replace,
    headers: JSON_HEADERS,
    body: JSON.stringify({ profileId }),
  });

export const updateChatParameters = (
  chatId: string,
  parameters: ChatParameters,
) =>
  request<Chat>(`${API_PATHS.chats}/${chatId}/settings`, {
    method: HTTP_METHODS.update,
    headers: JSON_HEADERS,
    body: JSON.stringify(parameters),
  });

export const deleteChat = (id: string) =>
  request<void>(`${API_PATHS.chats}/${id}`, {
    method: HTTP_METHODS.delete,
  });

export const updateUserMessage = (
  chatId: string,
  messageId: string,
  content: string,
) =>
  request<Chat>(`${API_PATHS.chats}/${chatId}/messages/${messageId}`, {
    method: HTTP_METHODS.update,
    headers: JSON_HEADERS,
    body: JSON.stringify({ content }),
  });

export const deleteTurn = (chatId: string, messageId: string) =>
  request<Chat>(`${API_PATHS.chats}/${chatId}/messages/${messageId}`, {
    method: HTTP_METHODS.delete,
  });

export async function streamMessage(
  id: string,
  content: string,
  attachments: ImageAttachment[],
  signal: AbortSignal,
  onEvent: (event: StreamEvent) => void,
) {
  const response = await fetch(`${API_PATHS.chats}/${id}/messages`, {
    method: HTTP_METHODS.create,
    headers: JSON_HEADERS,
    body: JSON.stringify({ content, attachments }),
    signal,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      body?.error || formatRequestFailedMessage(response.status),
    );
  }
  if (!response.body) throw new Error(UI_TEXT.errors.streamBody);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;

  while (!done) {
    const result = await reader.read();
    done = result.done;
    buffer += decoder.decode(result.value, { stream: !done });
    const blocks = buffer.split(SSE.blockSeparator);
    buffer = blocks.pop() ?? "";
    blocks.forEach((block) => emit(block, onEvent));
  }
  if (buffer.trim()) emit(buffer, onEvent);
}

function emit(block: string, onEvent: (event: StreamEvent) => void) {
  const data = block
    .split(SSE.lineSeparator)
    .find((line) => line.startsWith(SSE.dataPrefix))
    ?.slice(SSE.dataPrefix.length)
    .trimStart();
  if (data) onEvent(JSON.parse(data) as StreamEvent);
}
