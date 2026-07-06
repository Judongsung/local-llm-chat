export const HTTP_METHODS = {
  create: "POST",
  update: "PATCH",
  replace: "PUT",
  delete: "DELETE",
} as const;

export const HTTP_STATUS = {
  ok: 200,
  created: 201,
  noContent: 204,
  badRequest: 400,
  notFound: 404,
  conflict: 409,
  internalServerError: 500,
} as const;

export const CONTENT_TYPES = {
  json: "application/json",
  eventStream: "text/event-stream; charset=utf-8",
} as const;

export const JSON_HEADERS = {
  "Content-Type": CONTENT_TYPES.json,
} as const;

export const SSE = {
  dataPrefix: "data:",
  eventSuffix: "\n\n",
  blockSeparator: /\r?\n\r?\n/,
  lineSeparator: /\r?\n/,
} as const;
