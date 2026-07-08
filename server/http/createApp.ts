import express from "express";
import { API_ROOT, createChatRouter } from "../chat/chatRouter.ts";
import {
  ChatBusyError,
  ChatNotFoundError,
  ChatService,
  ProfileConflictError,
} from "../chat/chatService.ts";
import { HTTP_STATUS } from "../../shared/constants/http.ts";
import {
  SERVER_ERROR_MESSAGES,
  SERVER_EXPRESS_SETTINGS,
  SERVER_LIMITS,
} from "../../shared/constants/server.ts";

export function createApi(service: ChatService, models: string[]) {
  const app = express();

  app.disable(SERVER_EXPRESS_SETTINGS.poweredBy);
  app.use(express.json({ limit: SERVER_LIMITS.jsonBody }));
  app.use(createChatRouter(service, models));

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
      if (isHttpErrorStatus(error, HTTP_STATUS.payloadTooLarge)) {
        return response
          .status(HTTP_STATUS.payloadTooLarge)
          .json({ error: SERVER_ERROR_MESSAGES.requestTooLarge });
      }
      if (isHttpErrorStatus(error, HTTP_STATUS.badRequest)) {
        return response
          .status(HTTP_STATUS.badRequest)
          .json({ error: SERVER_ERROR_MESSAGES.invalidJson });
      }
      if (error instanceof ChatNotFoundError) {
        return response
          .status(HTTP_STATUS.notFound)
          .json({ error: error.message });
      }
      if (
        error instanceof ChatBusyError ||
        error instanceof ProfileConflictError
      ) {
        return response
          .status(HTTP_STATUS.conflict)
          .json({ error: error.message });
      }
      console.error(error);
      response
        .status(HTTP_STATUS.internalServerError)
        .json({ error: SERVER_ERROR_MESSAGES.internalServer });
    },
  );

  return app;
}

function isHttpErrorStatus(error: unknown, status: number) {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status?: unknown }).status === status
  );
}
