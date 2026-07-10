import { existsSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express from "express";
import { createServer as createViteServer } from "vite";
import { ChatService } from "./chat/chatService.ts";
import { JsonChatRepository } from "./chat/persistence/JsonChatRepository.ts";
import { loadConfig } from "./loadServerConfig.ts";
import { createApi } from "./http/createApp.ts";
import { createOpenAiCompletionStreamer } from "./llm/openAiCompletionStreamer.ts";
import {
  SERVER_STARTUP_MESSAGES,
  SERVER_STATIC_OPTIONS,
} from "../shared/constants/server.ts";

const PARENT_DIRECTORY = "..";
const DEVELOPMENT_FLAG = "--dev";
const VITE_APP_TYPE = "spa";
const BUILD_DIRECTORY = "dist";
const INDEX_FILE = "index.html";

const root = join(
  dirname(fileURLToPath(import.meta.url)),
  PARENT_DIRECTORY,
);
const config = loadConfig(root);
const repository = new JsonChatRepository(
  config.dataDirectory,
  config.defaultSettings,
);
await repository.load();
const completionStreamer = createOpenAiCompletionStreamer(config.models);
const service = new ChatService(repository, completionStreamer);
const app = createApi(
  service,
  config.models.map(({ model }) => model),
);
const server = createHttpServer(app);
const development = process.argv.includes(DEVELOPMENT_FLAG);

if (development) {
  const vite = await createViteServer({
    root,
    appType: VITE_APP_TYPE,
    server: { middlewareMode: true, hmr: { server } },
  });
  app.use(vite.middlewares);
} else {
  const output = join(root, BUILD_DIRECTORY);
  if (!existsSync(output)) {
    throw new Error(SERVER_STARTUP_MESSAGES.missingBuild(BUILD_DIRECTORY));
  }
  app.use(express.static(output, SERVER_STATIC_OPTIONS));
  app.use((_request, response) =>
    response.sendFile(join(output, INDEX_FILE)),
  );
}

server.listen(config.port, config.host, () => {
  console.log(SERVER_STARTUP_MESSAGES.listening(config.host, config.port));
});
