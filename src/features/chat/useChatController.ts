import { useEffect, useRef, useState } from "react";
import type {
  Chat,
  ChatMode,
  ChatSettings,
  ChatStageKey,
  ChatSummary,
  ImageAttachment,
  MessageStatus,
  ParameterProfile,
  ProfileCatalog,
  StreamEvent,
} from "../../../shared/types/chat.ts";
import {
  CHAT_MODE,
  CHAT_STAGE,
  MESSAGE_STATUS,
  STREAM_EVENT,
} from "../../../shared/constants/chat.ts";
import {
  createProfile,
  createChat,
  deleteChat,
  deleteProfile,
  deleteTurn,
  getChat,
  listChats,
  listModels,
  listProfiles,
  retryTranslation as retryTranslationRequest,
  selectProfile,
  streamMessage,
  updateChatSettings,
  updateProfile,
  updateUserMessage,
} from "./chatApi.ts";
import {
  appendPendingTurn,
  toSummary,
  updateAssistantMessage,
  updateStage,
} from "./chatState.ts";
import { UI_TEXT } from "../../constants/ui.ts";

type StreamProgress = {
  userId: string;
  assistantId: string;
  content: string;
  reasoning: string;
};

type OriginalInput = {
  content: string;
  attachments: ImageAttachment[];
};

export function useChatController() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [profileCatalog, setProfileCatalog] = useState<ProfileCatalog>({
    defaultProfileId: "",
    profiles: [],
  });
  const [chat, setChat] = useState<Chat | null>(null);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [activeStage, setActiveStage] = useState<ChatStageKey | null>(null);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [activeSourceMessageId, setActiveSourceMessageId] = useState<
    string | null
  >(null);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void initialize();
  }, []);

  async function initialize() {
    try {
      const [items, profiles, availableModels] = await Promise.all([
        listChats(),
        listProfiles(),
        listModels(),
      ]);
      setChats(items);
      setProfileCatalog(profiles);
      setModels(availableModels);
      setChat(items[0] ? await getChat(items[0].id) : null);
    } catch (cause) {
      showError(cause);
    } finally {
      setInitialized(true);
    }
  }

  async function refreshChats() {
    try {
      setChats(await listChats());
    } catch (cause) {
      showError(cause);
    }
  }

  async function openChat(id: string) {
    if (busy || id === chat?.id) return;
    try {
      setChat(await getChat(id));
      setSidebarOpen(false);
      setError("");
    } catch (cause) {
      showError(cause);
    }
  }

  async function addChat(mode: ChatMode): Promise<boolean> {
    if (busy) return false;
    try {
      const created = await createChat(mode);
      setChat(created);
      setSidebarOpen(false);
      setError("");
      await refreshChats();
      return true;
    } catch (cause) {
      showError(cause);
      return false;
    }
  }

  async function removeChat(id: string) {
    if (busy) return;
    try {
      await deleteChat(id);
      const items = await listChats();
      setChats(items);
      setSidebarOpen(false);
      if (chat?.id === id) {
        setChat(items[0] ? await getChat(items[0].id) : null);
      }
    } catch (cause) {
      showError(cause);
    }
  }

  async function saveSettings(stage: ChatStageKey) {
    if (!chat || busy) return;
    try {
      const settings = chatStage(chat, stage)?.settings;
      if (!settings) return;
      setChat(await updateChatSettings(chat.id, stage, settings));
      setError("");
    } catch (cause) {
      showError(cause);
    }
  }

  async function editPrompt(messageId: string, content: string) {
    if (!chat || busy) return false;
    try {
      setChat(await updateUserMessage(chat.id, messageId, content));
      setError("");
      await refreshChats();
      return true;
    } catch (cause) {
      showError(cause);
      return false;
    }
  }

  async function removePrompt(messageId: string) {
    if (!chat || busy) return false;
    try {
      setChat(await deleteTurn(chat.id, messageId));
      setError("");
      await refreshChats();
      return true;
    } catch (cause) {
      showError(cause);
      return false;
    }
  }

  async function chooseProfile(stage: ChatStageKey, profileId: string) {
    if (
      !chat ||
      busy ||
      chatStage(chat, stage)?.profileId === profileId
    ) {
      return;
    }
    try {
      setChat(await selectProfile(chat.id, stage, profileId));
      if (stage === CHAT_STAGE.generation) {
        setProfileCatalog(await listProfiles());
      }
      setError("");
    } catch (cause) {
      showError(cause);
    }
  }

  async function addProfile(
    name: string,
    settings: ChatSettings,
  ): Promise<ParameterProfile | null> {
    try {
      const created = await createProfile(name, settings);
      setProfileCatalog(await listProfiles());
      setError("");
      return created;
    } catch (cause) {
      showError(cause);
      return null;
    }
  }

  async function editProfile(
    id: string,
    name: string,
    settings: ChatSettings,
  ): Promise<boolean> {
    try {
      await updateProfile(id, name, settings);
      setProfileCatalog(await listProfiles());
      if (chat) setChat(await getChat(chat.id));
      setError("");
      return true;
    } catch (cause) {
      showError(cause);
      return false;
    }
  }

  async function removeProfile(id: string): Promise<boolean> {
    try {
      await deleteProfile(id);
      setProfileCatalog(await listProfiles());
      if (chat) setChat(await getChat(chat.id));
      setError("");
      return true;
    } catch (cause) {
      showError(cause);
      return false;
    }
  }

  function changeSetting<K extends keyof ChatSettings>(
    stage: ChatStageKey,
    key: K,
    value: ChatSettings[K],
  ) {
    setChat((current) =>
      current
        ? updateStage(current, stage, (stageData) => ({
            ...stageData,
            settings: { ...stageData.settings, [key]: value },
          }))
        : current,
    );
  }

  async function sendMessage() {
    const content = draft;
    const images = attachments;
    if (!chat || busy || (!content.trim() && images.length === 0)) return;
    setDraft("");
    setAttachments([]);
    await runStream(
      chat.id,
      (signal, onEvent) =>
        streamMessage(chat.id, content, images, signal, onEvent),
      { content, attachments: images },
    );
  }

  async function retryTranslation(sourceMessageId: string) {
    if (!chat || busy || chat.mode !== CHAT_MODE.translation) return;
    await runStream(chat.id, (signal, onEvent) =>
      retryTranslationRequest(
        chat.id,
        sourceMessageId,
        signal,
        onEvent,
      ),
    );
  }

  async function runStream(
    chatId: string,
    request: (
      signal: AbortSignal,
      onEvent: (event: StreamEvent) => void,
    ) => Promise<void>,
    original?: OriginalInput,
  ) {
    const controller = new AbortController();
    const progress: Partial<Record<ChatStageKey, StreamProgress>> = {};
    abortRef.current = controller;
    setBusy(true);
    setError("");

    try {
      await request(controller.signal, (event) => {
        if (event.type === STREAM_EVENT.start) {
          setActiveStage(event.stage);
          setActiveMessageId(event.assistantMessageId);
          setActiveSourceMessageId(
            event.sourceMessageId ??
              (event.stage === CHAT_STAGE.generation
                ? event.assistantMessageId
                : null),
          );
          const prompt =
            event.stage === CHAT_STAGE.generation
              ? original?.content ?? ""
              : progress.generation?.content ??
                sourceContent(chat, event.sourceMessageId);
          progress[event.stage] = {
            userId: event.userMessageId,
            assistantId: event.assistantMessageId,
            content: "",
            reasoning: "",
          };
          updateCurrentChat(chatId, (current) =>
            appendPendingTurn(
              current,
              event.stage,
              prompt,
              event.stage === CHAT_STAGE.generation
                ? original?.attachments ?? []
                : [],
              event.userMessageId,
              event.assistantMessageId,
              new Date().toISOString(),
              event.sourceMessageId,
            ),
          );
        } else if (
          event.type === STREAM_EVENT.delta ||
          event.type === STREAM_EVENT.reasoningDelta
        ) {
          const current = progress[event.stage];
          if (!current) return;
          if (event.type === STREAM_EVENT.delta) current.content += event.text;
          else current.reasoning += event.text;
          updateAssistant(
            chatId,
            event.stage,
            current,
            MESSAGE_STATUS.complete,
          );
        } else if (event.type === STREAM_EVENT.done) {
          setChat((current) =>
            current?.id === chatId ? event.chat : current,
          );
        } else {
          setError(event.message);
          setChat((current) =>
            current?.id === chatId ? event.chat : current,
          );
          restoreInputIfUnsaved(event.chat, progress.generation, original);
        }
      });
    } catch (cause) {
      const stopped = cause instanceof DOMException && cause.name === "AbortError";
      try {
        const latest = await getChat(chatId);
        setChat((current) => (current?.id === chatId ? latest : current));
        restoreInputIfUnsaved(latest, progress.generation, original);
      } catch {
        const stage = activeProgress(progress);
        if (stage) {
          updateAssistant(
            chatId,
            stage.key,
            stage.value,
            stopped ? MESSAGE_STATUS.stopped : MESSAGE_STATUS.error,
          );
        } else if (original) {
          setDraft(original.content);
          setAttachments(original.attachments);
        }
      }
      if (!stopped) showError(cause);
    } finally {
      abortRef.current = null;
      setActiveStage(null);
      setActiveMessageId(null);
      setActiveSourceMessageId(null);
      setBusy(false);
      await refreshChats();
    }
  }

  function restoreInputIfUnsaved(
    latest: Chat,
    generation: StreamProgress | undefined,
    original: OriginalInput | undefined,
  ) {
    if (
      original &&
      (!generation ||
        !latest.stages.generation.messages.some(
          (message) => message.id === generation.userId,
        ))
    ) {
      setDraft(original.content);
      setAttachments(original.attachments);
    }
  }

  function updateAssistant(
    chatId: string,
    stage: ChatStageKey,
    progress: StreamProgress,
    status: MessageStatus,
  ) {
    updateCurrentChat(chatId, (current) =>
      updateAssistantMessage(
        current,
        stage,
        progress.assistantId,
        progress.content,
        progress.reasoning,
        status,
      ),
    );
  }

  function updateCurrentChat(chatId: string, update: (chat: Chat) => Chat) {
    setChat((current) =>
      current?.id === chatId ? update(current) : current,
    );
  }

  function showError(cause: unknown) {
    setError(
      cause instanceof Error ? cause.message : UI_TEXT.errors.generic,
    );
  }

  return {
    chats,
    models,
    profileCatalog,
    chat,
    draft,
    attachments,
    busy,
    initialized,
    activeStage,
    activeMessageId,
    activeSourceMessageId,
    error,
    sidebarOpen,
    setDraft,
    setAttachments,
    setSidebarOpen,
    clearError: () => setError(""),
    openChat,
    addChat,
    removeChat,
    editPrompt,
    removePrompt,
    saveSettings,
    chooseProfile,
    addProfile,
    editProfile,
    removeProfile,
    changeSetting,
    sendMessage,
    retryTranslation,
    stopMessage: () => abortRef.current?.abort(),
  };
}

function chatStage(chat: Chat, stage: ChatStageKey) {
  return stage === CHAT_STAGE.generation
    ? chat.stages.generation
    : chat.mode === CHAT_MODE.translation
      ? chat.stages.translation
      : undefined;
}

function sourceContent(chat: Chat | null, sourceMessageId?: string) {
  return (
    chat?.stages.generation.messages.find(
      (message) => message.id === sourceMessageId,
    )?.content ?? ""
  );
}

function activeProgress(
  progress: Partial<Record<ChatStageKey, StreamProgress>>,
) {
  if (progress.translation) {
    return {
      key: CHAT_STAGE.translation,
      value: progress.translation,
    };
  }
  return progress.generation
    ? { key: CHAT_STAGE.generation, value: progress.generation }
    : null;
}
