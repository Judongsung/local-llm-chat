export const SERVER_PATHS = {
  modelCatalog: "llm-models.json",
  dataDirectory: "data",
} as const;

export const SERVER_FILE_ENCODING = "utf8";

export const SERVER_ENVIRONMENT_KEYS = {
  galleryRoot: "GALLERY_ROOT",
  host: "HOST",
  port: "PORT",
} as const;

export const SERVER_NETWORK_DEFAULTS = {
  host: "0.0.0.0",
  port: 3000,
  portRange: { min: 1, max: 65_535 },
} as const;

export const SERVER_LIMITS = {
  jsonBody: "6mb",
} as const;

export const SERVER_EXPRESS_SETTINGS = {
  poweredBy: "x-powered-by",
} as const;

const SERVER_STATIC_FILE_EXTENSIONS = ["html"];

export const SERVER_STATIC_OPTIONS = {
  dotfiles: "deny",
  extensions: SERVER_STATIC_FILE_EXTENSIONS,
  index: false,
} as const;
