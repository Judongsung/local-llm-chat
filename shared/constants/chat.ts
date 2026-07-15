export const STORE_VERSION = 2 as const;
export const CHAT_MODE = {
  standard: "standard",
  translation: "translation",
} as const;
export const CHAT_STAGE = {
  generation: "generation",
  translation: "translation",
} as const;
export const MESSAGE_ROLE = {
  user: "user",
  assistant: "assistant",
} as const;
export const MESSAGE_STATUS = {
  complete: "complete",
  stopped: "stopped",
  error: "error",
} as const;
export const REASONING_EFFORT = {
  none: "none",
  low: "low",
  medium: "medium",
  high: "high",
} as const;
export const STREAM_EVENT = {
  start: "start",
  delta: "delta",
  reasoningDelta: "reasoning_delta",
  done: "done",
  error: "error",
} as const;
export const CHAT_SETTING_KEYS = [
  "model",
  "systemPrompt",
  "temperature",
  "topP",
  "maxTokens",
  "reasoningEffort",
] as const;
export const DEFAULT_REASONING_EFFORT = REASONING_EFFORT.none;

export const CHAT_LIMITS = {
  title: 32,
  profileName: 50,
  message: 100_000,
  attachments: {
    count: 4,
    bytes: 5 * 1024 * 1024,
    requestBytes: 768 * 1024,
    name: 255,
    maxDimension: 1024,
    jpegQualities: [0.82, 0.72, 0.62],
  },
  model: 200,
  systemPrompt: 20_000,
  temperature: { min: 0, max: 2, step: 0.01, default: 0.9 },
  topP: { min: 0, max: 1, step: 0.01, default: 0.95 },
  maxTokens: { min: 1, max: 131_072, step: 1, default: 2048 },
} as const;

export const IMAGE_MIME_TYPE = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
} as const;
export const IMAGE_MIME_TYPES = Object.values(IMAGE_MIME_TYPE);
export const NORMALIZED_IMAGE_MIME_TYPE = IMAGE_MIME_TYPE.jpeg;
