export const STORE_VERSION = 1 as const;
export const DEFAULT_CHAT_TITLE = "새 대화";
export const DEFAULT_PROFILE_NAME = "기본";
export const DEFAULT_REASONING_EFFORT = "none" as const;

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
  temperature: { min: 0, max: 2, step: 0.01, default: 0.7 },
  topP: { min: 0, max: 1, step: 0.05, default: 1 },
  maxTokens: { min: 1, max: 131_072, step: 1, default: 2048 },
} as const;

export const IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
