import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { ChatSettings } from "../shared/types/chat.ts";
import {
  CHAT_LIMITS,
  DEFAULT_REASONING_EFFORT,
} from "../shared/constants/chat.ts";
import {
  SERVER_ENVIRONMENT_KEYS,
  SERVER_FILE_ENCODING,
  SERVER_NETWORK_DEFAULTS,
  SERVER_PATHS,
} from "../shared/constants/server.ts";
import { SERVER_CONFIG_ERROR_MESSAGES } from "../shared/constants/serverText.ko.ts";
import type { LlmModelConfig } from "../shared/types/llm.ts";

const SUPPORTED_URL_PROTOCOLS = new Set(["http:", "https:"]);

type ServerConfig = {
  host: string;
  port: number;
  dataDirectory: string;
  galleryRoot: string | null;
  models: LlmModelConfig[];
  defaultSettings: ChatSettings;
};

export function loadConfig(
  root: string,
  environment: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const port = Number(
    environment[SERVER_ENVIRONMENT_KEYS.port] ||
      SERVER_NETWORK_DEFAULTS.port,
  );
  if (
    !Number.isInteger(port) ||
    port < SERVER_NETWORK_DEFAULTS.portRange.min ||
    port > SERVER_NETWORK_DEFAULTS.portRange.max
  ) {
    throw new Error(SERVER_CONFIG_ERROR_MESSAGES.invalidPort);
  }
  const models = loadModels(join(root, SERVER_PATHS.modelCatalog));

  return {
    host:
      environment[SERVER_ENVIRONMENT_KEYS.host]?.trim() ||
      SERVER_NETWORK_DEFAULTS.host,
    port,
    dataDirectory: join(root, SERVER_PATHS.dataDirectory),
    galleryRoot: loadGalleryRoot(environment[SERVER_ENVIRONMENT_KEYS.galleryRoot]),
    models,
    defaultSettings: {
      model: models[0].model,
      systemPrompt: "",
      temperature: CHAT_LIMITS.temperature.default,
      topP: CHAT_LIMITS.topP.default,
      maxTokens: CHAT_LIMITS.maxTokens.default,
      reasoningEffort: DEFAULT_REASONING_EFFORT,
    },
  };
}

function loadGalleryRoot(value: string | undefined) {
  const path = value?.trim();
  if (!path) return null;
  try {
    if (!isAbsolute(path) || !statSync(path).isDirectory()) throw new Error();
    return realpathSync(path);
  } catch {
    throw new Error(SERVER_CONFIG_ERROR_MESSAGES.invalidGalleryRoot);
  }
}

function loadModels(filePath: string): LlmModelConfig[] {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(filePath, SERVER_FILE_ENCODING));
  } catch {
    throw new Error(SERVER_CONFIG_ERROR_MESSAGES.modelFileUnreadable);
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(SERVER_CONFIG_ERROR_MESSAGES.modelRequired);
  }

  const models = value.map((item, index) => parseModel(item, index));
  if (new Set(models.map(({ model }) => model)).size !== models.length) {
    throw new Error(SERVER_CONFIG_ERROR_MESSAGES.duplicateModel);
  }
  return models;
}

function parseModel(value: unknown, index: number): LlmModelConfig {
  if (
    !isRecord(value) ||
    typeof value.apiKey !== "string" ||
    !value.apiKey.trim() ||
    typeof value.baseUrl !== "string" ||
    !value.baseUrl.trim() ||
    typeof value.model !== "string" ||
    !value.model.trim() ||
    value.model.trim().length > CHAT_LIMITS.model
  ) {
    throw new Error(SERVER_CONFIG_ERROR_MESSAGES.invalidModel(index));
  }

  const baseUrl = value.baseUrl.trim();
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(SERVER_CONFIG_ERROR_MESSAGES.invalidModelUrl(index));
  }
  if (!SUPPORTED_URL_PROTOCOLS.has(url.protocol)) {
    throw new Error(SERVER_CONFIG_ERROR_MESSAGES.unsupportedModelUrl);
  }

  return {
    apiKey: value.apiKey.trim(),
    baseUrl,
    model: value.model.trim(),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
