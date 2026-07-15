import express from "express";
import { createChatRouter } from "../chat/chatRouter.ts";
import type { GalleryService } from "../gallery/galleryService.ts";
import { createGalleryRouter } from "../gallery/galleryRouter.ts";
import { ChatService } from "../chat/chatService.ts";
import {
  APPLICATION_ERROR_KIND,
  ApplicationError,
  type ApplicationErrorKind,
} from "../errors/applicationError.ts";
import { API_ROOT, HTTP_STATUS } from "../../shared/constants/http.ts";
import {
  SERVER_EXPRESS_SETTINGS,
  SERVER_LIMITS,
} from "../../shared/constants/server.ts";
import { SERVER_ERROR_MESSAGES } from "../../shared/constants/serverText.ko.ts";

const APPLICATION_ERROR_STATUS = {
  [APPLICATION_ERROR_KIND.badRequest]: HTTP_STATUS.badRequest,
  [APPLICATION_ERROR_KIND.notFound]: HTTP_STATUS.notFound,
  [APPLICATION_ERROR_KIND.conflict]: HTTP_STATUS.conflict,
} as const satisfies Record<ApplicationErrorKind, number>;

const FRAMEWORK_ERROR_MESSAGES = new Map<number, string>([
  [HTTP_STATUS.payloadTooLarge, SERVER_ERROR_MESSAGES.requestTooLarge],
  [HTTP_STATUS.badRequest, SERVER_ERROR_MESSAGES.invalidJson],
]);

export function createApi(
  service: ChatService,
  models: string[],
  galleryService?: GalleryService,
) {
  const app = express();

  app.disable(SERVER_EXPRESS_SETTINGS.poweredBy);
  app.use(express.json({ limit: SERVER_LIMITS.jsonBody }));
  app.use(createChatRouter(service, models));
  if (galleryService) app.use(createGalleryRouter(galleryService));

  app.use(API_ROOT, (_request, response) => {
    response
      .status(HTTP_STATUS.notFound)
      .json({ error: SERVER_ERROR_MESSAGES.unknownApiPath });
  });

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      const mappedError = mapHttpError(error);
      if (mappedError) {
        return response
          .status(mappedError.status)
          .json({ error: mappedError.message });
      }
      console.error(error);
      response
        .status(HTTP_STATUS.internalServerError)
        .json({ error: SERVER_ERROR_MESSAGES.internalServer });
    },
  );

  return app;
}

function mapHttpError(error: unknown) {
  if (error instanceof ApplicationError) {
    return {
      status: APPLICATION_ERROR_STATUS[error.kind],
      message: error.message,
    };
  }
  const status = getFrameworkErrorStatus(error);
  const message =
    status === null ? undefined : FRAMEWORK_ERROR_MESSAGES.get(status);
  return message && status !== null ? { status, message } : null;
}

function getFrameworkErrorStatus(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  ) {
    return (error as { status: number }).status;
  }
  return null;
}
