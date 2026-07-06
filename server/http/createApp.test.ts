import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import test from "node:test";
import type { Chat, ChatSettings } from "../../shared/types/chat.ts";
import { ChatService } from "../chat/chatService.ts";
import { JsonChatRepository } from "../chat/persistence/JsonChatRepository.ts";
import type { CompletionStreamer } from "../llm/completionStreamer.ts";
import { createApi } from "./createApp.ts";

const defaults: ChatSettings = {
  model: "test-model",
  systemPrompt: "",
  temperature: 0.7,
  topP: 1,
  maxTokens: 256,
  reasoningEffort: "none",
};

test("API는 채팅 생성부터 스트리밍 저장까지 처리한다", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "llm-chat-api-"));
  const repository = new JsonChatRepository(
    join(directory, "data"),
    defaults,
  );
  await repository.load();
  const completionStreamer: CompletionStreamer = async function* () {
    yield { type: "reasoning", text: "응답 검토" };
    yield { type: "content", text: "테스트 " };
    yield { type: "content", text: "응답" };
  };
  const service = new ChatService(repository, completionStreamer);
  const server = createApi(service, ["test-model", "other-model"]).listen(
    0,
    "127.0.0.1",
  );
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  context.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  context.after(() => rm(directory, { recursive: true, force: true }));

  const createdResponse = await fetch(`${base}/api/chats`, { method: "POST" });
  const created = (await createdResponse.json()) as Chat;
  assert.equal(createdResponse.status, 201);
  assert.deepEqual(await (await fetch(`${base}/api/models`)).json(), [
    "test-model",
    "other-model",
  ]);
  const initialCatalog = await (
    await fetch(`${base}/api/profiles`)
  ).json();

  const invalid = await fetch(`${base}/api/profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "", ...defaults, temperature: 99 }),
  });
  assert.equal(invalid.status, 400);
  const unknownModel = await fetch(`${base}/api/profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "알 수 없음",
      ...defaults,
      model: "missing-model",
    }),
  });
  assert.equal(unknownModel.status, 400);

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
    `${base}/api/chats/${created.id}/profile`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: profile.id }),
    },
  );
  assert.equal(selectResponse.status, 200);

  const settingsResponse = await fetch(
    `${base}/api/chats/${created.id}/settings`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...defaults, temperature: 1.1 }),
    },
  );
  const configured = (await settingsResponse.json()) as Chat;
  assert.equal(configured.settings.temperature, 1.1);
  assert.equal(configured.settings.systemPrompt, "정밀하게 답변");

  const stream = await fetch(`${base}/api/chats/${created.id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: "질문" }),
  });
  const events = await stream.text();
  assert.match(events, /"type":"reasoning_delta"/);
  assert.match(events, /"type":"delta"/);
  assert.match(events, /테스트/);

  const saved = (await (
    await fetch(`${base}/api/chats/${created.id}`)
  ).json()) as Chat;
  assert.deepEqual(
    saved.messages.map(({ role, content }) => [role, content]),
    [
      ["user", "질문"],
      ["assistant", "테스트 응답"],
    ],
  );
  assert.equal(saved.messages[1].reasoning, "응답 검토");

  const userMessageId = saved.messages[0].id;
  const invalidEdit = await fetch(
    `${base}/api/chats/${created.id}/messages/${userMessageId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: " " }),
    },
  );
  assert.equal(invalidEdit.status, 400);

  const editResponse = await fetch(
    `${base}/api/chats/${created.id}/messages/${userMessageId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "수정된 질문" }),
    },
  );
  const edited = (await editResponse.json()) as Chat;
  assert.equal(editResponse.status, 200);
  assert.equal(edited.messages[0].content, "수정된 질문");
  assert.equal(edited.title, "수정된 질문");

  const deleteResponse = await fetch(
    `${base}/api/chats/${created.id}/messages/${userMessageId}`,
    { method: "DELETE" },
  );
  const afterDelete = (await deleteResponse.json()) as Chat;
  assert.equal(deleteResponse.status, 200);
  assert.deepEqual(afterDelete.messages, []);

  const deleteInitialProfile = await fetch(
    `${base}/api/profiles/${initialCatalog.profiles[0].id}`,
    { method: "DELETE" },
  );
  assert.equal(deleteInitialProfile.status, 204);
  const deleteLastProfile = await fetch(
    `${base}/api/profiles/${profile.id}`,
    { method: "DELETE" },
  );
  assert.equal(deleteLastProfile.status, 409);
});
