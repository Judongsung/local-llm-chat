import { useEffect, useRef, useState } from "react";
import rehypeKatex from "rehype-katex";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import {
  CHAT_LIMITS,
  CHAT_MODE,
  CHAT_STAGE,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
} from "../../../shared/constants/chat.ts";
import type {
  Chat,
  ChatStageKey,
  ImageAttachment,
  Message,
} from "../../../shared/types/chat.ts";
import { UI_TEXT } from "../../constants/uiText.ko.ts";

type Props = {
  chat: Chat | null;
  busy: boolean;
  activeStage: ChatStageKey | null;
  activeMessageId: string | null;
  activeSourceMessageId: string | null;
  onEdit: (messageId: string, content: string) => Promise<boolean>;
  onDelete: (messageId: string) => Promise<boolean>;
  onRetryTranslation: (sourceMessageId: string) => void;
};

export function MessageList({
  chat,
  busy,
  activeStage,
  activeMessageId,
  activeSourceMessageId,
  onEdit,
  onDelete,
  onRetryTranslation,
}: Props) {
  const messagesRef = useRef<HTMLElement | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [
    chat?.stages.generation.messages,
    chat?.mode === CHAT_MODE.translation
      ? chat.stages.translation.messages
      : null,
  ]);

  useEffect(() => {
    setEditingId(null);
  }, [chat?.id]);

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

  const generationMessages = chat?.stages.generation.messages ?? [];

  return (
    <section className="messages" aria-live="polite" ref={messagesRef}>
      {generationMessages.length === 0 && (
        <div className="empty-state">
          <strong>{UI_TEXT.messages.emptyTitle}</strong>
          <span>{UI_TEXT.messages.emptyDescription}</span>
        </div>
      )}
      {chat?.mode === CHAT_MODE.translation
        ? generationMessages.map((message, index) => {
            if (message.role !== MESSAGE_ROLE.user) return null;
            const english = generationMessages[index + 1];
            const translated =
              english?.role === MESSAGE_ROLE.assistant
                ? translatedAssistant(chat, english.id)
                : undefined;
            return (
              <TranslationTurn
                key={message.id}
                user={message}
                english={
                  english?.role === MESSAGE_ROLE.assistant
                    ? english
                    : undefined
                }
                translated={translated}
                busy={busy}
                activeStage={activeStage}
                activeMessageId={activeMessageId}
                activeSourceMessageId={activeSourceMessageId}
                editingId={editingId}
                editingContent={editingContent}
                onEditingContent={setEditingContent}
                onStartEdit={(item) => {
                  setEditingId(item.id);
                  setEditingContent(item.content);
                }}
                onSaveEdit={() => void saveEdit()}
                onCancelEdit={() => setEditingId(null)}
                onDelete={() => void remove(message.id)}
                onRetryTranslation={onRetryTranslation}
              />
            );
          })
        : generationMessages.map((message) => (
            <StandardMessage
              key={message.id}
              message={message}
              busy={busy}
              streaming={
                activeStage === CHAT_STAGE.generation &&
                message.role === MESSAGE_ROLE.assistant &&
                message.id === activeMessageId
              }
              editing={editingId === message.id}
              editingContent={editingContent}
              onEditingContent={setEditingContent}
              onStartEdit={() => {
                setEditingId(message.id);
                setEditingContent(message.content);
              }}
              onSaveEdit={() => void saveEdit()}
              onCancelEdit={() => setEditingId(null)}
              onDelete={() => void remove(message.id)}
            />
          ))}
    </section>
  );
}

function TranslationTurn({
  user,
  english,
  translated,
  busy,
  activeStage,
  activeMessageId,
  activeSourceMessageId,
  editingId,
  editingContent,
  onEditingContent,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onRetryTranslation,
}: {
  user: Message;
  english?: Message;
  translated?: Message;
  busy: boolean;
  activeStage: ChatStageKey | null;
  activeMessageId: string | null;
  activeSourceMessageId: string | null;
  editingId: string | null;
  editingContent: string;
  onEditingContent: (content: string) => void;
  onStartEdit: (message: Message) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onRetryTranslation: (sourceMessageId: string) => void;
}) {
  const canRetry =
    !busy &&
    english?.status === MESSAGE_STATUS.complete &&
    translated?.status !== MESSAGE_STATUS.complete;

  return (
    <>
      <UserMessage
        message={user}
        busy={busy}
        editing={editingId === user.id}
        editingContent={editingContent}
        onEditingContent={onEditingContent}
        onStartEdit={() => onStartEdit(user)}
        onSaveEdit={onSaveEdit}
        onCancelEdit={onCancelEdit}
        onDelete={onDelete}
      />
      {english && (
        <article className="message assistant">
          <div className="message-meta">
            <strong>{UI_TEXT.messages.assistant}</strong>
            {translated?.status !== undefined &&
              translated.status !== MESSAGE_STATUS.complete && (
                <MessageStatusLabel status={translated.status} />
              )}
            {canRetry && (
              <div className="message-actions">
                <button
                  type="button"
                  onClick={() => onRetryTranslation(english.id)}
                >
                  {UI_TEXT.messages.retryTranslation}
                </button>
              </div>
            )}
          </div>
          <div className="message-content">
            {translated ? (
              <>
                {translated.reasoning && (
                  <ReasoningDetails
                    content={translated.reasoning}
                    streaming={
                      activeStage === CHAT_STAGE.translation &&
                      translated.id === activeMessageId
                    }
                  />
                )}
                {translated.content ? (
                  <MarkdownContent>{translated.content}</MarkdownContent>
                ) : (
                  <p>{UI_TEXT.messages.translatingKorean}</p>
                )}
              </>
            ) : (
              <p>
                {activeStage === CHAT_STAGE.generation &&
                english.id === activeSourceMessageId
                  ? UI_TEXT.messages.generatingEnglish
                  : activeStage === CHAT_STAGE.translation &&
                      english.id === activeSourceMessageId
                    ? UI_TEXT.messages.translatingKorean
                    : UI_TEXT.messages.translationUnavailable}
              </p>
            )}
            <details className="message-original">
              <summary>{UI_TEXT.messages.originalEnglish}</summary>
              <div className="message-original-content">
                {english.reasoning && (
                  <ReasoningDetails
                    content={english.reasoning}
                    streaming={
                      activeStage === CHAT_STAGE.generation &&
                      english.id === activeMessageId
                    }
                  />
                )}
                <MarkdownContent>{english.content}</MarkdownContent>
              </div>
            </details>
          </div>
        </article>
      )}
    </>
  );
}

function StandardMessage({
  message,
  busy,
  streaming,
  editing,
  editingContent,
  onEditingContent,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: {
  message: Message;
  busy: boolean;
  streaming: boolean;
  editing: boolean;
  editingContent: string;
  onEditingContent: (content: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}) {
  if (message.role === MESSAGE_ROLE.user) {
    return (
      <UserMessage
        message={message}
        busy={busy}
        editing={editing}
        editingContent={editingContent}
        onEditingContent={onEditingContent}
        onStartEdit={onStartEdit}
        onSaveEdit={onSaveEdit}
        onCancelEdit={onCancelEdit}
        onDelete={onDelete}
      />
    );
  }
  return (
    <article className="message assistant">
      <div className="message-meta">
        <strong>{UI_TEXT.messages.assistant}</strong>
        {message.status !== MESSAGE_STATUS.complete && (
          <MessageStatusLabel status={message.status} />
        )}
      </div>
      <div className="message-content">
        {message.reasoning && (
          <ReasoningDetails content={message.reasoning} streaming={streaming} />
        )}
        <MarkdownContent>{message.content}</MarkdownContent>
      </div>
    </article>
  );
}

function UserMessage({
  message,
  busy,
  editing,
  editingContent,
  onEditingContent,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: {
  message: Message;
  busy: boolean;
  editing: boolean;
  editingContent: string;
  onEditingContent: (content: string) => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className={`message user${editing ? " editing" : ""}`}>
      <div className="message-meta">
        <strong>{UI_TEXT.messages.user}</strong>
        {!editing && (
          <div className="message-actions">
            <button type="button" disabled={busy} onClick={onStartEdit}>
              {UI_TEXT.messages.edit}
            </button>
            <button type="button" disabled={busy} onClick={onDelete}>
              {UI_TEXT.messages.delete}
            </button>
          </div>
        )}
      </div>
      {editing ? (
        <div className="message-edit">
          <textarea
            aria-label={UI_TEXT.messages.editPrompt}
            value={editingContent}
            maxLength={CHAT_LIMITS.message}
            onChange={(event) => onEditingContent(event.target.value)}
          />
          <div className="message-edit-actions">
            <button
              type="button"
              disabled={busy || !editingContent.trim()}
              onClick={onSaveEdit}
            >
              {UI_TEXT.messages.save}
            </button>
            <button type="button" disabled={busy} onClick={onCancelEdit}>
              {UI_TEXT.messages.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div className="message-content">
          {message.attachments && (
            <ImageAttachments attachments={message.attachments} />
          )}
          {message.content}
        </div>
      )}
    </article>
  );
}

function translatedAssistant(chat: Chat, sourceMessageId: string) {
  if (chat.mode !== CHAT_MODE.translation) return undefined;
  const index = chat.stages.translation.messages.findIndex(
    (message) => message.sourceMessageId === sourceMessageId,
  );
  const assistant = chat.stages.translation.messages[index + 1];
  return assistant?.role === MESSAGE_ROLE.assistant ? assistant : undefined;
}

function MessageStatusLabel({ status }: { status: Message["status"] }) {
  return (
    <span>
      {status === MESSAGE_STATUS.stopped
        ? UI_TEXT.messages.stopped
        : UI_TEXT.messages.error}
    </span>
  );
}

function ImageAttachments({
  attachments,
}: {
  attachments: ImageAttachment[];
}) {
  return (
    <div className="message-attachments">
      {attachments.map((attachment) => (
        <img
          key={attachment.id}
          src={attachment.dataUrl}
          alt={attachment.name}
        />
      ))}
    </div>
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
