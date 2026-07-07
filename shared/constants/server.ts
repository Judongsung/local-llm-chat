export const SERVER_PATHS = {
  modelCatalog: "llm-models.json",
  dataDirectory: "data",
} as const;

export const SERVER_ENVIRONMENT_KEYS = {
  host: "HOST",
  port: "PORT",
} as const;

export const SERVER_NETWORK_DEFAULTS = {
  host: "0.0.0.0",
  port: 3000,
  portRange: { min: 1, max: 65_535 },
} as const;
