import type { FormEvent } from "react";
import { CHAT_LIMITS } from "../../../../shared/constants/chat.ts";
import { UI_TEXT } from "../../../constants/ui.ts";

type Props = {
  draft: string;
  disabled: boolean;
  busy: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
};

export function MessageComposer({
  draft,
  disabled,
  busy,
  onDraftChange,
  onSend,
  onStop,
}: Props) {
  function submit(event: FormEvent) {
    event.preventDefault();
    onSend();
  }

  return (
    <form className="composer" onSubmit={submit}>
      <textarea
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder={UI_TEXT.composer.placeholder}
        rows={3}
        maxLength={CHAT_LIMITS.message}
        disabled={disabled || busy}
        aria-label={UI_TEXT.composer.message}
        enterKeyHint="enter"
      />
      {busy ? (
        <button type="button" className="stop-button" onClick={onStop}>
          {UI_TEXT.composer.stop}
        </button>
      ) : (
        <button type="submit" disabled={disabled || !draft.trim()}>
          {UI_TEXT.composer.send}
        </button>
      )}
    </form>
  );
}
