import type {
  Chat,
  ChatMode,
  ChatSettings,
  ChatStageKey,
  ChatSummary,
  ImageAttachment,
  ParameterProfile,
  ProfileCatalog,
  StreamEvent,
} from "../../../shared/types/chat.ts";
import {
  API_PATHS,
  HTTP_METHODS,
  HTTP_STATUS,
  JSON_HEADERS,
  SSE,
} from "../../../shared/constants/http.ts";
import { UI_TEXT, UI_TEXT_FORMATTERS } from "../../constants/uiText.ko.ts";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      body?.error || UI_TEXT_FORMATTERS.requestFailed(response.status),
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

export const createChat = (mode: ChatMode) =>
  request<Chat>(API_PATHS.chats, {
    method: HTTP_METHODS.create,
    headers: JSON_HEADERS,
    body: JSON.stringify({ mode }),
  });

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

export const selectProfile = (
  chatId: string,
  stage: ChatStageKey,
  profileId: string,
) =>
  request<Chat>(`${API_PATHS.chats}/${chatId}/stages/${stage}/profile`, {
    method: HTTP_METHODS.replace,
    headers: JSON_HEADERS,
    body: JSON.stringify({ profileId }),
  });

export const updateChatSettings = (
  chatId: string,
  stage: ChatStageKey,
  settings: ChatSettings,
) =>
  request<Chat>(`${API_PATHS.chats}/${chatId}/stages/${stage}/settings`, {
    method: HTTP_METHODS.update,
    headers: JSON_HEADERS,
    body: JSON.stringify(settings),
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
  return stream(
    `${API_PATHS.chats}/${id}/messages`,
    { content, attachments },
    signal,
    onEvent,
  );
}

export async function retryTranslation(
  chatId: string,
  sourceMessageId: string,
  signal: AbortSignal,
  onEvent: (event: StreamEvent) => void,
) {
  return stream(
    `${API_PATHS.chats}/${chatId}/messages/${sourceMessageId}/translation`,
    undefined,
    signal,
    onEvent,
  );
}

async function stream(
  path: string,
  body: unknown,
  signal: AbortSignal,
  onEvent: (event: StreamEvent) => void,
) {
  const response = await fetch(path, {
    method: HTTP_METHODS.create,
    ...(body === undefined
      ? {}
      : { headers: JSON_HEADERS, body: JSON.stringify(body) }),
    signal,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      body?.error || UI_TEXT_FORMATTERS.requestFailed(response.status),
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
