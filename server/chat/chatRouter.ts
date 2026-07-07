import { Router, type Response } from "express";
import type { StreamEvent } from "../../shared/types/chat.ts";
import {
  CONTENT_TYPES,
  HTTP_STATUS,
  SSE,
} from "../../shared/constants/http.ts";
import { ChatService } from "./chatService.ts";
import {
  parseChatParameters,
  parseChatSettings,
  parseMessageInput,
  parseProfileName,
  parsePrompt,
} from "./chatValidation.ts";

export const API_ROOT = "/api";

const ROUTES = {
  chats: `${API_ROOT}/chats`,
  models: `${API_ROOT}/models`,
  profiles: `${API_ROOT}/profiles`,
  profile: `${API_ROOT}/profiles/:id`,
  chatProfile: `${API_ROOT}/chats/:id/profile`,
  chatSettings: `${API_ROOT}/chats/:id/settings`,
  chat: `${API_ROOT}/chats/:id`,
  message: `${API_ROOT}/chats/:id/messages/:messageId`,
  messages: `${API_ROOT}/chats/:id/messages`,
} as const;
const ERROR_MESSAGES = {
  invalidProfile: "프로필 이름이나 파라미터 값이 올바르지 않습니다.",
  invalidProfileId: "프로필 ID가 올바르지 않습니다.",
  invalidParameters: "파라미터 값이 올바르지 않습니다.",
  invalidMessage: "메시지나 이미지 첨부가 올바르지 않습니다.",
} as const;
const SSE_HEADERS = {
  "Content-Type": CONTENT_TYPES.eventStream,
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;
const RESPONSE_CLOSE_EVENT = "close";

export function createChatRouter(service: ChatService, models: string[]) {
  const router = Router();
  const availableModels = new Set(models);

  router.get(ROUTES.chats, (_request, response) => {
    response.json(service.listChats());
  });

  router.get(ROUTES.models, (_request, response) => {
    response.json(models);
  });

  router.post(ROUTES.chats, async (_request, response) => {
    response.status(HTTP_STATUS.created).json(await service.createChat());
  });

  router.get(ROUTES.profiles, (_request, response) => {
    response.json(service.listProfiles());
  });

  router.post(ROUTES.profiles, async (request, response) => {
    const name = parseProfileName(request.body?.name);
    const settings = parseChatSettings(request.body);
    if (!name || !settings || !availableModels.has(settings.model)) {
      return response.status(HTTP_STATUS.badRequest).json({
        error: ERROR_MESSAGES.invalidProfile,
      });
    }
    response
      .status(HTTP_STATUS.created)
      .json(await service.createProfile(name, settings));
  });

  router.patch(ROUTES.profile, async (request, response) => {
    const name = parseProfileName(request.body?.name);
    const settings = parseChatSettings(request.body);
    if (!name || !settings || !availableModels.has(settings.model)) {
      return response.status(HTTP_STATUS.badRequest).json({
        error: ERROR_MESSAGES.invalidProfile,
      });
    }
    response.json(
      await service.updateProfile(request.params.id, name, settings),
    );
  });

  router.delete(ROUTES.profile, async (request, response) => {
    await service.deleteProfile(request.params.id);
    response.status(HTTP_STATUS.noContent).end();
  });

  router.put(ROUTES.chatProfile, async (request, response) => {
    if (typeof request.body?.profileId !== "string") {
      return response.status(HTTP_STATUS.badRequest).json({
        error: ERROR_MESSAGES.invalidProfileId,
      });
    }
    response.json(
      await service.selectProfile(request.params.id, request.body.profileId),
    );
  });

  router.patch(ROUTES.chatSettings, async (request, response) => {
    const parameters = parseChatParameters(request.body);
    if (!parameters || !availableModels.has(parameters.model)) {
      return response.status(HTTP_STATUS.badRequest).json({
        error: ERROR_MESSAGES.invalidParameters,
      });
    }
    response.json(
      await service.updateChatParameters(request.params.id, parameters),
    );
  });

  router.get(ROUTES.chat, (request, response) => {
    response.json(service.getChat(request.params.id));
  });

  router.delete(ROUTES.chat, async (request, response) => {
    await service.deleteChat(request.params.id);
    response.status(HTTP_STATUS.noContent).end();
  });

  router.patch(
    ROUTES.message,
    async (request, response) => {
      const content = parsePrompt(request.body?.content);
      if (!content) {
        return response.status(HTTP_STATUS.badRequest).json({
          error: ERROR_MESSAGES.invalidMessage,
        });
      }
      response.json(
        await service.updateUserMessage(
          request.params.id,
          request.params.messageId,
          content,
        ),
      );
    },
  );

  router.delete(
    ROUTES.message,
    async (request, response) => {
      response.json(
        await service.deleteTurn(
          request.params.id,
          request.params.messageId,
        ),
      );
    },
  );

  router.post(ROUTES.messages, async (request, response) => {
    const message = parseMessageInput(request.body);
    if (!message) {
      return response.status(HTTP_STATUS.badRequest).json({
        error: ERROR_MESSAGES.invalidMessage,
      });
    }

    const abortController = new AbortController();
    const events = service.streamMessage(
      request.params.id,
      message,
      abortController.signal,
    );

    response.status(HTTP_STATUS.ok);
    response.set(SSE_HEADERS);
    response.flushHeaders();

    let responseFinished = false;
    response.on(RESPONSE_CLOSE_EVENT, () => {
      if (!responseFinished) abortController.abort();
    });

    for await (const event of events) send(response, event);
    responseFinished = true;
    response.end();
  });

  return router;
}

function send(response: Response, event: StreamEvent) {
  if (!response.writableEnded && !response.destroyed) {
    response.write(
      `${SSE.dataPrefix} ${JSON.stringify(event)}${SSE.eventSuffix}`,
    );
  }
}
