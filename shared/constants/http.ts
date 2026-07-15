export const HTTP_METHODS = {
  create: "POST",
  update: "PATCH",
  replace: "PUT",
  delete: "DELETE",
} as const;

export const API_ROOT = "/api";
export const API_PATHS = {
  chats: `${API_ROOT}/chats`,
  gallery: `${API_ROOT}/gallery`,
  galleryStatus: `${API_ROOT}/gallery/status`,
  models: `${API_ROOT}/models`,
  profiles: `${API_ROOT}/profiles`,
} as const;

export const HTTP_STATUS = {
  ok: 200,
  created: 201,
  noContent: 204,
  badRequest: 400,
  notFound: 404,
  conflict: 409,
  payloadTooLarge: 413,
  internalServerError: 500,
} as const;

export const CONTENT_TYPES = {
  json: "application/json",
  eventStream: "text/event-stream; charset=utf-8",
} as const;

export const HTTP_HEADER = {
  authorization: "Authorization",
  contentType: "Content-Type",
  cacheControl: "Cache-Control",
  connection: "Connection",
  acceleratorBuffering: "X-Accel-Buffering",
} as const;

export const JSON_HEADERS = {
  [HTTP_HEADER.contentType]: CONTENT_TYPES.json,
} as const;

export const SSE = {
  dataPrefix: "data:",
  eventSuffix: "\n\n",
  blockSeparator: /\r?\n\r?\n/,
  lineSeparator: /\r?\n/,
  headers: {
    [HTTP_HEADER.contentType]: CONTENT_TYPES.eventStream,
    [HTTP_HEADER.cacheControl]: "no-cache, no-transform",
    [HTTP_HEADER.connection]: "keep-alive",
    [HTTP_HEADER.acceleratorBuffering]: "no",
  },
} as const;
