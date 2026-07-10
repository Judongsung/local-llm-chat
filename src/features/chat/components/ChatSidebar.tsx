import type { ChatSummary } from "../../../../shared/types/chat.ts";
import { CHAT_MODE } from "../../../../shared/constants/chat.ts";
import {
  UI_LOCALE,
  UI_SYMBOLS,
  UI_TEXT,
  UI_TEXT_FORMATTERS,
} from "../../../constants/ui.ts";

type Props = {
  chats: ChatSummary[];
  currentChatId?: string;
  busy: boolean;
  profilesReady: boolean;
  onAdd: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenProfiles: () => void;
  onClose: () => void;
};

export function ChatSidebar({
  chats,
  currentChatId,
  busy,
  profilesReady,
  onAdd,
  onOpen,
  onDelete,
  onOpenProfiles,
  onClose,
}: Props) {
  function confirmDelete(item: ChatSummary) {
    if (window.confirm(UI_TEXT.sidebar.deleteConfirm)) onDelete(item.id);
  }

  return (
    <aside className="sidebar" id="chat-sidebar">
      <div className="sidebar-heading">
        <h1>{UI_TEXT.sidebar.brand}</h1>
        <div className="sidebar-actions">
          <button type="button" onClick={onAdd} disabled={busy}>
            {UI_TEXT.sidebar.newChat}
          </button>
          <button
            type="button"
            className="sidebar-close"
            onClick={onClose}
            aria-label={UI_TEXT.sidebar.close}
          >
            {UI_SYMBOLS.close}
          </button>
        </div>
      </div>
      <nav className="chat-list" aria-label={UI_TEXT.sidebar.chatList}>
        {chats.map((item) => (
          <div className="chat-row" key={item.id}>
            <button
              type="button"
              className={
                item.id === currentChatId ? "chat-link active" : "chat-link"
              }
              onClick={() => onOpen(item.id)}
              disabled={busy}
            >
              <span>{item.title}</span>
              {item.mode === CHAT_MODE.translation && (
                <span className="chat-mode-badge">
                  {UI_TEXT.sidebar.translationBadge}
                </span>
              )}
              <small>
                {new Date(item.updatedAt).toLocaleString(UI_LOCALE)}
              </small>
            </button>
            <button
              type="button"
              className="delete-button"
              onClick={() => confirmDelete(item)}
              disabled={busy}
              aria-label={UI_TEXT_FORMATTERS.deleteChatLabel(item.title)}
            >
              {UI_SYMBOLS.close}
            </button>
          </div>
        ))}
      </nav>
      <button
        type="button"
        className="profile-settings-button"
        onClick={onOpenProfiles}
        disabled={busy || !profilesReady}
      >
        {UI_TEXT.sidebar.profileSettings}
      </button>
    </aside>
  );
}
