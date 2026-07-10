import { useEffect, useRef } from "react";
import type { ChatMode } from "../../../../shared/types/chat.ts";
import { CHAT_MODE } from "../../../../shared/constants/chat.ts";
import { UI_SYMBOLS, UI_TEXT } from "../../../constants/ui.ts";

type Props = {
  busy: boolean;
  onClose: () => void;
  onCreate: (mode: ChatMode) => Promise<boolean>;
};

export function ChatTypeDialog({ busy, onClose, onCreate }: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  async function create(mode: ChatMode) {
    if (await onCreate(mode)) dialogRef.current?.close();
  }

  return (
    <dialog
      className="profile-dialog chat-type-dialog"
      ref={dialogRef}
      onClose={onClose}
    >
      <header>
        <div>
          <h2>{UI_TEXT.chatTypeDialog.title}</h2>
          <p>{UI_TEXT.chatTypeDialog.description}</p>
        </div>
        <button
          type="button"
          className="dialog-close"
          onClick={() => dialogRef.current?.close()}
          aria-label={UI_TEXT.chatTypeDialog.close}
        >
          {UI_SYMBOLS.close}
        </button>
      </header>
      <div className="chat-type-options">
        <button
          type="button"
          disabled={busy}
          onClick={() => void create(CHAT_MODE.standard)}
        >
          <strong>{UI_TEXT.chatTypeDialog.standard}</strong>
          <span>{UI_TEXT.chatTypeDialog.standardDescription}</span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void create(CHAT_MODE.translation)}
        >
          <strong>{UI_TEXT.chatTypeDialog.translation}</strong>
          <span>{UI_TEXT.chatTypeDialog.translationDescription}</span>
        </button>
      </div>
    </dialog>
  );
}
