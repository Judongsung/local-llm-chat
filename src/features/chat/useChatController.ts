import { useEffect, useRef, useState } from "react";
import type {
  Chat,
  ChatParameters,
  ChatSettings,
  ChatSummary,
  ImageAttachment,
  MessageStatus,
  ParameterProfile,
  ProfileCatalog,
  StreamEvent,
} from "../../../shared/types/chat.ts";
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
  selectProfile,
  streamMessage,
  updateChatParameters,
  updateProfile,
  updateUserMessage,
} from "./chatApi.ts";
import {
  appendPendingTurn,
  removePendingTurn,
  toSummary,
  updateAssistantMessage,
} from "./chatState.ts";
import { UI_TEXT } from "../../constants/ui.ts";

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
      const first = items[0] ? await getChat(items[0].id) : await createChat();
      setChats(items[0] ? items : [toSummary(first)]);
      setProfileCatalog(profiles);
      setModels(availableModels);
      setChat(first);
    } catch (cause) {
      showError(cause);
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

  async function addChat() {
    if (busy) return;
    try {
      const created = await createChat();
      setChat(created);
      setSidebarOpen(false);
      await refreshChats();
    } catch (cause) {
      showError(cause);
    }
  }

  async function removeChat(id: string) {
    if (busy) return;
    try {
      await deleteChat(id);
      const items = await listChats();
      if (chat?.id !== id) {
        setChats(items);
        setSidebarOpen(false);
        return;
      }
      const next = items[0] ? await getChat(items[0].id) : await createChat();
      setChat(next);
      setChats(items[0] ? items : [toSummary(next)]);
      setSidebarOpen(false);
    } catch (cause) {
      showError(cause);
    }
  }

  async function saveSettings() {
    if (!chat || busy) return;
    try {
      setChat(await updateChatParameters(chat.id, toParameters(chat.settings)));
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

  async function chooseProfile(profileId: string) {
    if (!chat || busy || profileId === chat.profileId) return;
    try {
      setChat(await selectProfile(chat.id, profileId));
      setProfileCatalog(await listProfiles());
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

  function changeSetting<K extends keyof ChatParameters>(
    key: K,
    value: ChatParameters[K],
  ) {
    setChat((current) =>
      current
        ? { ...current, settings: { ...current.settings, [key]: value } }
        : current,
    );
  }

  async function sendMessage() {
    const content = draft;
    const images = attachments;
    if (!chat || busy || (!content.trim() && images.length === 0)) return;

    const chatId = chat.id;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setDraft("");
    setAttachments([]);
    setError("");

    let userId = "";
    let assistantId = "";
    let received = "";
    let receivedReasoning = "";

    try {
      await streamMessage(
        chatId,
        content,
        images,
        controller.signal,
        (streamEvent) => {
          if (streamEvent.type === "start") {
            userId = streamEvent.userMessageId;
            assistantId = streamEvent.assistantMessageId;
            updateCurrentChat(chatId, (current) =>
              appendPendingTurn(
                current,
                content,
                images,
                userId,
                assistantId,
                new Date().toISOString(),
              ),
            );
          } else if (streamEvent.type === "delta") {
            received += streamEvent.text;
            updateAssistant(
              chatId,
              assistantId,
              received,
              receivedReasoning,
              "complete",
            );
          } else if (streamEvent.type === "reasoning_delta") {
            receivedReasoning += streamEvent.text;
            updateAssistant(
              chatId,
              assistantId,
              received,
              receivedReasoning,
              "complete",
            );
          } else if (streamEvent.type === "done") {
            setChat((current) =>
              current?.id === chatId ? streamEvent.chat : current,
            );
          } else {
            handleStreamError(
              streamEvent,
              chatId,
              userId,
              assistantId,
              content,
              images,
              received,
              receivedReasoning,
            );
          }
        },
      );
    } catch (cause) {
      const stopped = cause instanceof DOMException && cause.name === "AbortError";
      if (received || receivedReasoning) {
        updateAssistant(
          chatId,
          assistantId,
          received,
          receivedReasoning,
          stopped ? "stopped" : "error",
        );
      } else {
        removePending(chatId, userId, assistantId);
        setDraft(content);
        setAttachments(images);
      }
      if (!stopped) showError(cause);
    } finally {
      abortRef.current = null;
      setBusy(false);
      await refreshChats();
    }
  }

  function handleStreamError(
    streamEvent: Extract<StreamEvent, { type: "error" }>,
    chatId: string,
    userId: string,
    assistantId: string,
    content: string,
    attachments: ImageAttachment[],
    received: string,
    receivedReasoning: string,
  ) {
    setError(streamEvent.message);
    if (streamEvent.partialSaved) {
      updateAssistant(
        chatId,
        assistantId,
        received,
        receivedReasoning,
        "error",
      );
    } else {
      removePending(chatId, userId, assistantId);
      setDraft(content);
      setAttachments(attachments);
    }
  }

  function updateAssistant(
    chatId: string,
    assistantId: string,
    content: string,
    reasoning: string,
    status: MessageStatus,
  ) {
    updateCurrentChat(chatId, (current) =>
      updateAssistantMessage(
        current,
        assistantId,
        content,
        reasoning,
        status,
      ),
    );
  }

  function removePending(chatId: string, userId: string, assistantId: string) {
    updateCurrentChat(chatId, (current) =>
      removePendingTurn(current, userId, assistantId),
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
    stopMessage: () => abortRef.current?.abort(),
  };
}

function toParameters(settings: ChatSettings): ChatParameters {
  const { model, temperature, topP, maxTokens, reasoningEffort } = settings;
  return { model, temperature, topP, maxTokens, reasoningEffort };
}
