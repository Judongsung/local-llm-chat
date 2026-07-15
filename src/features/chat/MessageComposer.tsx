import type { ChangeEvent, FormEvent } from "react";
import {
  CHAT_LIMITS,
  IMAGE_MIME_TYPES,
  NORMALIZED_IMAGE_MIME_TYPE,
} from "../../../shared/constants/chat.ts";
import type { ImageAttachment } from "../../../shared/types/chat.ts";
import { UI_TEXT } from "../../constants/uiText.ko.ts";

const OUTPUT_IMAGE_TYPE = NORMALIZED_IMAGE_MIME_TYPE;
const OUTPUT_IMAGE_EXTENSION = ".jpg";
const OUTPUT_IMAGE_FALLBACK_NAME = "image";
const CANVAS_ELEMENT_NAME = "canvas";
const CANVAS_CONTEXT_TYPE = "2d";
const LOAD_EVENT = "load";
const ERROR_EVENT = "error";
const COMPOSER_TEXTAREA_ROWS = 3;
const RANDOM_ID_RADIX = 36;
const RANDOM_ID_PREFIX_LENGTH = 2;
const IMAGE_PROCESSING_ERRORS = {
  canvasUnavailable: "canvas unavailable",
  imageTooLarge: "image too large",
  imageLoadFailed: "image load failed",
  imageEncodeFailed: "image encode failed",
} as const;

type Props = {
  draft: string;
  attachments: ImageAttachment[];
  disabled: boolean;
  busy: boolean;
  onDraftChange: (value: string) => void;
  onAttachmentsChange: (value: ImageAttachment[]) => void;
  onSend: () => void;
  onStop: () => void;
};

export function MessageComposer({
  draft,
  attachments,
  disabled,
  busy,
  onDraftChange,
  onAttachmentsChange,
  onSend,
  onStop,
}: Props) {
  function submit(event: FormEvent) {
    event.preventDefault();
    onSend();
  }

  async function addImages(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;

    const remaining = CHAT_LIMITS.attachments.count - attachments.length;
    const accepted = files
      .filter(
        (file) =>
          IMAGE_MIME_TYPES.some((mimeType) => mimeType === file.type) &&
          file.size <= CHAT_LIMITS.attachments.bytes,
      )
      .slice(0, remaining);
    if (accepted.length !== files.length) {
      window.alert(UI_TEXT.composer.imageRejected);
    }
    try {
      onAttachmentsChange([
        ...attachments,
        ...(await Promise.all(accepted.map(toAttachment))),
      ]);
    } catch {
      window.alert(UI_TEXT.composer.imageRejected);
    }
  }

  function removeImage(id: string) {
    onAttachmentsChange(
      attachments.filter((attachment) => attachment.id !== id),
    );
  }

  return (
    <form className="composer" onSubmit={submit}>
      <div className="composer-input">
        {attachments.length > 0 && (
          <div className="composer-attachments">
            {attachments.map((attachment) => (
              <div className="composer-attachment" key={attachment.id}>
                <img src={attachment.dataUrl} alt={attachment.name} />
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => removeImage(attachment.id)}
                  aria-label={UI_TEXT.composer.removeImage}
                >
                  {UI_TEXT.composer.removeImage}
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder={UI_TEXT.composer.placeholder}
          rows={COMPOSER_TEXTAREA_ROWS}
          maxLength={CHAT_LIMITS.message}
          disabled={disabled || busy}
          aria-label={UI_TEXT.composer.message}
          enterKeyHint="enter"
        />
        <label className="image-picker">
          {UI_TEXT.composer.attachImage}
          <input
            type="file"
            accept={IMAGE_MIME_TYPES.join(",")}
            multiple
            disabled={
              disabled ||
              busy ||
              attachments.length >= CHAT_LIMITS.attachments.count
            }
            onChange={(event) => void addImages(event)}
          />
        </label>
      </div>
      {busy ? (
        <button type="button" className="stop-button" onClick={onStop}>
          {UI_TEXT.composer.stop}
        </button>
      ) : (
        <button
          type="submit"
          disabled={disabled || (!draft.trim() && attachments.length === 0)}
        >
          {UI_TEXT.composer.send}
        </button>
      )}
    </form>
  );
}

function toAttachment(file: File): Promise<ImageAttachment> {
  return normalizeImage(file).then(({ dataUrl, size }) => ({
    id: createAttachmentId(),
    name: outputName(file.name),
    mimeType: OUTPUT_IMAGE_TYPE,
    dataUrl,
    size,
  }));
}

async function normalizeImage(file: File) {
  const image = await loadImage(file);
  const scale = Math.min(
    1,
    CHAT_LIMITS.attachments.maxDimension /
      Math.max(image.naturalWidth, image.naturalHeight),
  );
  const canvas = document.createElement(CANVAS_ELEMENT_NAME);
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext(CANVAS_CONTEXT_TYPE);
  if (!context) throw new Error(IMAGE_PROCESSING_ERRORS.canvasUnavailable);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  for (const quality of CHAT_LIMITS.attachments.jpegQualities) {
    const blob = await canvasToBlob(canvas, quality);
    if (blob.size <= CHAT_LIMITS.attachments.requestBytes) {
      return {
        dataUrl: await blobToDataUrl(blob),
        size: blob.size,
      };
    }
  }
  throw new Error(IMAGE_PROCESSING_ERRORS.imageTooLarge);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.addEventListener(LOAD_EVENT, () => {
      URL.revokeObjectURL(url);
      resolve(image);
    });
    image.addEventListener(ERROR_EVENT, () => {
      URL.revokeObjectURL(url);
      reject(new Error(IMAGE_PROCESSING_ERRORS.imageLoadFailed));
    });
    image.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error(IMAGE_PROCESSING_ERRORS.imageEncodeFailed)),
      OUTPUT_IMAGE_TYPE,
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener(LOAD_EVENT, () => resolve(String(reader.result)));
    reader.addEventListener(ERROR_EVENT, () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

function outputName(name: string) {
  return `${
    name.replace(/\.[^.]*$/, "") || OUTPUT_IMAGE_FALLBACK_NAME
  }${OUTPUT_IMAGE_EXTENSION}`;
}

function createAttachmentId() {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random()
      .toString(RANDOM_ID_RADIX)
      .slice(RANDOM_ID_PREFIX_LENGTH)}`;
}
