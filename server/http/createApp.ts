import express from "express";
import { API_ROOT, createChatRouter } from "../chat/chatRouter.ts";
import {
  ChatBusyError,
  ChatNotFoundError,
  ChatService,
  ProfileConflictError,
} from "../chat/chatService.ts";
import { HTTP_STATUS } from "../../shared/constants/http.ts";

const JSON_BODY_LIMIT = "256kb";
const ERROR_MESSAGES = {
  unknownApiPath: "API 경로를 찾을 수 없습니다.",
  internalServer: "서버 오류가 발생했습니다.",
} as const;

export function createApi(service: ChatService, models: string[]) {
  const app = express();

  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(createChatRouter(service, models));

  app.use(API_ROOT, (_request, response) => {
    response
      .status(HTTP_STATUS.notFound)
      .json({ error: ERROR_MESSAGES.unknownApiPath });
  });

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
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
        .json({ error: ERROR_MESSAGES.internalServer });
    },
  );

  return app;
}
