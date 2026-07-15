export const APPLICATION_ERROR_KIND = {
  badRequest: "badRequest",
  notFound: "notFound",
  conflict: "conflict",
} as const;

export type ApplicationErrorKind =
  (typeof APPLICATION_ERROR_KIND)[keyof typeof APPLICATION_ERROR_KIND];

export class ApplicationError extends Error {
  readonly kind: ApplicationErrorKind;

  constructor(kind: ApplicationErrorKind, message: string) {
    super(message);
    this.name = "ApplicationError";
    this.kind = kind;
  }
}

export const applicationError = {
  badRequest: (message: string) =>
    new ApplicationError(APPLICATION_ERROR_KIND.badRequest, message),
  notFound: (message: string) =>
    new ApplicationError(APPLICATION_ERROR_KIND.notFound, message),
  conflict: (message: string) =>
    new ApplicationError(APPLICATION_ERROR_KIND.conflict, message),
} as const;
