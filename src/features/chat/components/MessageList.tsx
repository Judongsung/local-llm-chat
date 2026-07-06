import { useEffect, useRef, useState } from "react";
import rehypeKatex from "rehype-katex";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { CHAT_LIMITS } from "../../../../shared/constants/chat.ts";
import type { Chat } from "../../../../shared/types/chat.ts";
import { UI_TEXT } from "../../../constants/ui.ts";

type Props = {
  chat: Chat | null;
  busy: boolean;
  onEdit: (messageId: string, content: string) => Promise<boolean>;
  onDelete: (messageId: string) => Promise<boolean>;
};

export function MessageList({ chat, busy, onEdit, onDelete }: Props) {
  const messagesRef = useRef<HTMLElement | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [chat?.messages]);

  useEffect(() => {
    setEditingId(null);
  }, [chat?.id]);

  const streamingMessageId =
    busy && chat?.messages.at(-1)?.role === "assistant"
      ? chat.messages.at(-1)?.id
      : undefined;

  async function saveEdit() {
    if (
      !editingId ||
      !editingContent.trim() ||
      editingContent.length > CHAT_LIMITS.message
    ) {
      return;
    }
    if (await onEdit(editingId, editingContent)) setEditingId(null);
  }

  async function remove(messageId: string) {
    if (window.confirm(UI_TEXT.messages.deleteConfirm)) {
      await onDelete(messageId);
    }
  }

  return (
    <section className="messages" aria-live="polite" ref={messagesRef}>
      {chat?.messages.length === 0 && (
        <div className="empty-state">
          <strong>{UI_TEXT.messages.emptyTitle}</strong>
          <span>{UI_TEXT.messages.emptyDescription}</span>
        </div>
      )}
      {chat?.messages.map((message) => (
        <article
          key={message.id}
          className={`message ${message.role}${
            editingId === message.id ? " editing" : ""
          }`}
        >
          <div className="message-meta">
            <strong>
              {message.role === "user"
                ? UI_TEXT.messages.user
                : UI_TEXT.messages.assistant}
            </strong>
            {message.status !== "complete" && (
              <span>
                {message.status === "stopped"
                  ? UI_TEXT.messages.stopped
                  : UI_TEXT.messages.error}
              </span>
            )}
            {message.role === "user" && editingId !== message.id && (
              <div className="message-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditingId(message.id);
                    setEditingContent(message.content);
                  }}
                >
                  {UI_TEXT.messages.edit}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(message.id)}
                >
                  {UI_TEXT.messages.delete}
                </button>
              </div>
            )}
          </div>
          {editingId === message.id ? (
            <div className="message-edit">
              <textarea
                aria-label={UI_TEXT.messages.editPrompt}
                value={editingContent}
                maxLength={CHAT_LIMITS.message}
                onChange={(event) => setEditingContent(event.target.value)}
              />
              <div className="message-edit-actions">
                <button
                  type="button"
                  disabled={busy || !editingContent.trim()}
                  onClick={() => void saveEdit()}
                >
                  {UI_TEXT.messages.save}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditingId(null)}
                >
                  {UI_TEXT.messages.cancel}
                </button>
              </div>
            </div>
          ) : (
            <div className="message-content">
              {message.role === "assistant" ? (
                <>
                  {message.reasoning && (
                    <ReasoningDetails
                      content={message.reasoning}
                      streaming={message.id === streamingMessageId}
                    />
                  )}
                  <MarkdownContent>{message.content}</MarkdownContent>
                </>
              ) : (
                message.content
              )}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}

function ReasoningDetails({
  content,
  streaming,
}: {
  content: string;
  streaming: boolean;
}) {
  const [open, setOpen] = useState(streaming);

  useEffect(() => {
    setOpen(streaming);
  }, [streaming]);

  return (
    <details
      className="message-reasoning"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{UI_TEXT.messages.reasoning}</summary>
      <div className="message-reasoning-content">
        <MarkdownContent>{content}</MarkdownContent>
      </div>
    </details>
  );
}

function MarkdownContent({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
    >
      {children}
    </ReactMarkdown>
  );
}
