import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ChatSettings } from "../shared/types/chat.ts";
import {
  CHAT_LIMITS,
  DEFAULT_REASONING_EFFORT,
} from "../shared/constants/chat.ts";
import type { LlmModelConfig } from "../shared/types/llm.ts";

const MODEL_CATALOG_FILE = "llm-models.json";
const DATA_DIRECTORY = "data";
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 3000;
const PORT_RANGE = { min: 1, max: 65_535 } as const;
const ENVIRONMENT_KEYS = { host: "HOST", port: "PORT" } as const;
const SUPPORTED_URL_PROTOCOLS = new Set(["http:", "https:"]);

type ServerConfig = {
  host: string;
  port: number;
  dataDirectory: string;
  models: LlmModelConfig[];
  defaultSettings: ChatSettings;
};

export function loadConfig(
  root: string,
  environment: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const port = Number(environment[ENVIRONMENT_KEYS.port] || DEFAULT_PORT);
  if (
    !Number.isInteger(port) ||
    port < PORT_RANGE.min ||
    port > PORT_RANGE.max
  ) {
    throw new Error(
      `${ENVIRONMENT_KEYS.port}는 ${PORT_RANGE.min}~${PORT_RANGE.max} 사이의 정수여야 합니다.`,
    );
  }
  const models = loadModels(join(root, MODEL_CATALOG_FILE));

  return {
    host: environment[ENVIRONMENT_KEYS.host]?.trim() || DEFAULT_HOST,
    port,
    dataDirectory: join(root, DATA_DIRECTORY),
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

function loadModels(filePath: string): LlmModelConfig[] {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    throw new Error(`${MODEL_CATALOG_FILE} 파일을 읽을 수 없습니다.`);
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(
      `${MODEL_CATALOG_FILE}에는 모델 설정이 하나 이상 필요합니다.`,
    );
  }

  const models = value.map((item, index) => parseModel(item, index));
  if (new Set(models.map(({ model }) => model)).size !== models.length) {
    throw new Error(`${MODEL_CATALOG_FILE}의 model 값은 중복될 수 없습니다.`);
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
    throw new Error(
      `${MODEL_CATALOG_FILE}의 ${index + 1}번째 설정이 올바르지 않습니다.`,
    );
  }

  const baseUrl = value.baseUrl.trim();
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error(
      `${MODEL_CATALOG_FILE}의 ${index + 1}번째 URL이 올바르지 않습니다.`,
    );
  }
  if (!SUPPORTED_URL_PROTOCOLS.has(url.protocol)) {
    throw new Error(
      `${MODEL_CATALOG_FILE}의 URL은 HTTP 또는 HTTPS여야 합니다.`,
    );
  }

  return {
    apiKey: value.apiKey.trim(),
    baseUrl,
    model: value.model.trim(),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
