import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import test from "node:test";
import sharp from "sharp";
import { DEFAULT_TRANSLATION_SYSTEM_PROMPT } from "../../shared/constants/chatText.ko.ts";
import type { Chat, ChatSettings } from "../../shared/types/chat.ts";
import type { GalleryPage } from "../../shared/types/gallery.ts";
import { ChatService } from "../chat/chatService.ts";
import { JsonChatRepository } from "../chat/persistence/JsonChatRepository.ts";
import type {
  CompletionInput,
  CompletionStreamer,
} from "../llm/completionStreamer.ts";
import { createApi } from "./createApp.ts";
import { GalleryService } from "../gallery/galleryService.ts";

const defaults: ChatSettings = {
  model: "test-model",
  systemPrompt: "",
  temperature: 0.7,
  topP: 1,
  maxTokens: 256,
  reasoningEffort: "none",
};

test("API는 일반 채팅과 2단계 번역 채팅을 처리한다", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "llm-chat-api-"));
  const repository = new JsonChatRepository(join(directory, "data"), defaults);
  await repository.load();
  const calls: CompletionInput[] = [];
  const completionStreamer: CompletionStreamer = async function* (input) {
    calls.push(structuredClone(input));
    yield { type: "reasoning", text: "응답 검토" };
    yield {
      type: "content",
      text:
        input.settings.systemPrompt === DEFAULT_TRANSLATION_SYSTEM_PROMPT
          ? "한글 답변"
          : "English answer",
    };
  };
  const service = new ChatService(repository, completionStreamer);
  const server = createApi(service, ["test-model", "other-model"]).listen(
    0,
    "127.0.0.1",
  );
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  context.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  context.after(() => rm(directory, { recursive: true, force: true }));

  const createdResponse = await fetch(`${base}/api/chats`, { method: "POST" });
  const standard = (await createdResponse.json()) as Chat;
  assert.equal(createdResponse.status, 201);
  assert.equal(createdResponse.headers.get("x-powered-by"), null);
  assert.equal(standard.mode, "standard");
  assert.deepEqual(await (await fetch(`${base}/api/models`)).json(), [
    "test-model",
    "other-model",
  ]);

  const malformedJson = await fetch(`${base}/api/profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(malformedJson.status, 400);
  const invalidMode = await fetch(`${base}/api/chats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "unknown" }),
  });
  assert.equal(invalidMode.status, 400);
  assert.equal((await fetch(`${base}/api/chats/missing-chat`)).status, 404);

  const profileResponse = await fetch(`${base}/api/profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "정밀",
      ...defaults,
      systemPrompt: "정밀하게 답변",
    }),
  });
  const profile = await profileResponse.json();
  assert.equal(profileResponse.status, 201);

  const selectResponse = await fetch(
    `${base}/api/chats/${standard.id}/stages/generation/profile`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: profile.id }),
    },
  );
  assert.equal(selectResponse.status, 200);
  const settingsResponse = await fetch(
    `${base}/api/chats/${standard.id}/stages/generation/settings`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...profile.settings,
        systemPrompt: "채팅별 프롬프트",
        temperature: 1.1,
      }),
    },
  );
  const configured = (await settingsResponse.json()) as Chat;
  assert.equal(configured.stages.generation.settings.temperature, 1.1);
  assert.equal(
    configured.stages.generation.settings.systemPrompt,
    "채팅별 프롬프트",
  );

  const standardStream = await fetch(
    `${base}/api/chats/${standard.id}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "질문" }),
    },
  );
  const standardEvents = await standardStream.text();
  assert.match(standardEvents, /"stage":"generation"/);
  const savedStandard = (await (
    await fetch(`${base}/api/chats/${standard.id}`)
  ).json()) as Chat;
  assert.deepEqual(
    savedStandard.stages.generation.messages.map(({ role, content }) => [
      role,
      content,
    ]),
    [
      ["user", "질문"],
      ["assistant", "English answer"],
    ],
  );

  const translationResponse = await fetch(`${base}/api/chats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "translation" }),
  });
  const translation = (await translationResponse.json()) as Chat;
  assert.equal(translation.mode, "translation");
  const translatedStream = await fetch(
    `${base}/api/chats/${translation.id}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "번역 질문" }),
    },
  );
  const translatedEvents = await translatedStream.text();
  assert.match(translatedEvents, /"stage":"generation"/);
  assert.match(translatedEvents, /"stage":"translation"/);

  const savedTranslation = (await (
    await fetch(`${base}/api/chats/${translation.id}`)
  ).json()) as Chat;
  if (savedTranslation.mode !== "translation") {
    assert.fail("번역 채팅이 필요합니다.");
  }
  const english = savedTranslation.stages.generation.messages[1];
  assert.equal(english.content, "English answer");
  assert.equal(
    savedTranslation.stages.translation.messages[0].sourceMessageId,
    english.id,
  );
  assert.equal(savedTranslation.stages.translation.messages[1].content, "한글 답변");
  assert.equal(calls.at(-1)?.prompt, "English answer");
  assert.deepEqual(calls.at(-1)?.attachments, []);
  assert.deepEqual(calls.at(-1)?.history, []);

  const secondStream = await fetch(`${base}/api/chats/${translation.id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: "둘째 질문" }),
  });
  await secondStream.text();
  assert.equal(calls.at(-1)?.history.length, 2);
  assert.equal(calls.at(-1)?.history[0].content, "English answer");
  assert.equal(calls.at(-1)?.history[1].content, "한글 답변");

  const retryComplete = await fetch(
    `${base}/api/chats/${translation.id}/messages/${english.id}/translation`,
    { method: "POST" },
  );
  assert.equal(retryComplete.status, 409);

  const userMessageId = savedTranslation.stages.generation.messages[0].id;
  const deleteResponse = await fetch(
    `${base}/api/chats/${translation.id}/messages/${userMessageId}`,
    { method: "DELETE" },
  );
  const afterDelete = (await deleteResponse.json()) as Chat;
  if (afterDelete.mode !== "translation") assert.fail("번역 채팅이 필요합니다.");
  assert.equal(afterDelete.stages.generation.messages.length, 2);
  assert.equal(afterDelete.stages.translation.messages.length, 2);
});

test("갤러리 목록, 썸네일과 영상 Range 요청을 제공한다", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "llm-chat-gallery-api-"));
  const dataDirectory = join(directory, "data");
  const galleryDirectory = join(directory, ".private-gallery");
  await mkdir(galleryDirectory);
  await sharp({
    create: { width: 20, height: 20, channels: 3, background: "#336699" },
  })
    .jpeg()
    .toFile(join(galleryDirectory, "photo.jpg"));
  await writeFile(join(galleryDirectory, "video.mp4"), "0123456789");
  const repository = new JsonChatRepository(dataDirectory, defaults);
  await repository.load();
  const completionStreamer: CompletionStreamer = async function* () {};
  const service = new ChatService(repository, completionStreamer);
  const server = createApi(
    service,
    ["test-model"],
    new GalleryService(galleryDirectory),
  ).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  context.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  context.after(() => rm(directory, { recursive: true, force: true }));

  assert.deepEqual(await (await fetch(`${base}/api/gallery/status`)).json(), {
    enabled: true,
  });
  const page = (await (await fetch(`${base}/api/gallery`)).json()) as GalleryPage;
  const invalidCursor = await fetch(
    `${base}/api/gallery?cursor=${encodeURIComponent("not+base64")}`,
  );
  assert.equal(invalidCursor.status, 400);
  const photo = page.items.find(({ kind }) => kind === "image");
  const video = page.items.find(({ kind }) => kind === "video");
  assert.ok(photo?.thumbnailUrl);
  assert.ok(video);

  const original = await fetch(`${base}${photo.mediaUrl}`);
  assert.equal(original.status, 200);
  assert.equal(original.headers.get("content-type"), "image/jpeg");
  assert.ok((await original.arrayBuffer()).byteLength > 0);

  const thumbnail = await fetch(`${base}${photo.thumbnailUrl}`);
  assert.equal(thumbnail.status, 200);
  assert.equal(thumbnail.headers.get("content-type"), "image/webp");
  assert.match(thumbnail.headers.get("cache-control") ?? "", /immutable/);

  const range = await fetch(`${base}${video.mediaUrl}`, {
    headers: { Range: "bytes=0-3" },
  });
  assert.equal(range.status, 206);
  assert.equal(await range.text(), "0123");
  assert.equal(range.headers.get("accept-ranges"), "bytes");
});
