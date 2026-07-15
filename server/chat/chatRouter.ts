import { Router, type Response } from "express";
import type { StreamEvent } from "../../shared/types/chat.ts";
import {
  API_PATHS,
  API_ROOT,
  HTTP_STATUS,
  SSE,
} from "../../shared/constants/http.ts";
import { SERVER_ERROR_MESSAGES } from "../../shared/constants/serverText.ko.ts";
import { ChatService } from "./chatService.ts";
import {
  parseChatMode,
  parseChatSettings,
  parseChatStage,
  parseMessageInput,
  parseProfileName,
  parsePrompt,
} from "./chatValidation.ts";

const ROUTES = {
  chats: API_PATHS.chats,
  models: API_PATHS.models,
  profiles: API_PATHS.profiles,
  profile: `${API_PATHS.profiles}/:id`,
  stageProfile: `${API_PATHS.chats}/:id/stages/:stage/profile`,
  stageSettings: `${API_PATHS.chats}/:id/stages/:stage/settings`,
  chat: `${API_PATHS.chats}/:id`,
  message: `${API_PATHS.chats}/:id/messages/:messageId`,
  messages: `${API_PATHS.chats}/:id/messages`,
  retryTranslation: `${API_PATHS.chats}/:id/messages/:messageId/translation`,
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

  router.post(ROUTES.chats, async (request, response) => {
    const mode = parseChatMode(request.body?.mode);
    if (!mode) {
      return response.status(HTTP_STATUS.badRequest).json({
        error: SERVER_ERROR_MESSAGES.invalidChatMode,
      });
    }
    response.status(HTTP_STATUS.created).json(await service.createChat(mode));
  });

  router.get(ROUTES.profiles, (_request, response) => {
    response.json(service.listProfiles());
  });

  router.post(ROUTES.profiles, async (request, response) => {
    const name = parseProfileName(request.body?.name);
    const settings = parseChatSettings(request.body);
    if (!name || !settings || !availableModels.has(settings.model)) {
      return response.status(HTTP_STATUS.badRequest).json({
        error: SERVER_ERROR_MESSAGES.invalidProfile,
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
        error: SERVER_ERROR_MESSAGES.invalidProfile,
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

  router.put(ROUTES.stageProfile, async (request, response) => {
    const stage = parseChatStage(request.params.stage);
    if (!stage || typeof request.body?.profileId !== "string") {
      return response.status(HTTP_STATUS.badRequest).json({
        error: stage
          ? SERVER_ERROR_MESSAGES.invalidProfileId
          : SERVER_ERROR_MESSAGES.invalidChatStage,
      });
    }
    response.json(
      await service.selectProfile(
        request.params.id,
        stage,
        request.body.profileId,
      ),
    );
  });

  router.patch(ROUTES.stageSettings, async (request, response) => {
    const stage = parseChatStage(request.params.stage);
    const settings = parseChatSettings(request.body);
    if (!stage || !settings || !availableModels.has(settings.model)) {
      return response.status(HTTP_STATUS.badRequest).json({
        error: stage
          ? SERVER_ERROR_MESSAGES.invalidParameters
          : SERVER_ERROR_MESSAGES.invalidChatStage,
      });
    }
    response.json(
      await service.updateChatSettings(request.params.id, stage, settings),
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
          error: SERVER_ERROR_MESSAGES.invalidMessage,
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
        error: SERVER_ERROR_MESSAGES.invalidMessage,
      });
    }

    const abortController = new AbortController();
    await stream(
      response,
      service.streamMessage(
        request.params.id,
        message,
        abortController.signal,
      ),
      abortController,
    );
  });

  router.post(ROUTES.retryTranslation, async (request, response) => {
    const abortController = new AbortController();
    await stream(
      response,
      service.retryTranslation(
        request.params.id,
        request.params.messageId,
        abortController.signal,
      ),
      abortController,
    );
  });

  return router;
}

async function stream(
  response: Response,
  events: AsyncIterable<StreamEvent>,
  abortController: AbortController,
) {
    response.status(HTTP_STATUS.ok);
    response.set(SSE.headers);
    response.flushHeaders();

    let responseFinished = false;
    response.on(RESPONSE_CLOSE_EVENT, () => {
      if (!responseFinished) abortController.abort();
    });

    for await (const event of events) send(response, event);
    responseFinished = true;
    response.end();
}

function send(response: Response, event: StreamEvent) {
  if (!response.writableEnded && !response.destroyed) {
    response.write(
      `${SSE.dataPrefix} ${JSON.stringify(event)}${SSE.eventSuffix}`,
    );
  }
}
