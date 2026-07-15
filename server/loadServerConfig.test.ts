import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig } from "./loadServerConfig.ts";

test("모델 JSON을 읽고 첫 항목을 기본 모델로 사용한다", async () => {
  const root = await mkdtemp(join(tmpdir(), "llm-chat-config-"));
  try {
    await writeFile(
      join(root, "llm-models.json"),
      JSON.stringify([
        {
          apiKey: "first-secret",
          baseUrl: "https://first.test/v1",
          model: "first-model",
        },
        {
          apiKey: "second-secret",
          baseUrl: "http://second.test/v1",
          model: "second-model",
        },
      ]),
    );

    const config = loadConfig(root, { HOST: "127.0.0.1", PORT: "4000" });

    assert.equal(config.defaultSettings.model, "first-model");
    assert.deepEqual(
      config.models.map(({ model }) => model),
      ["first-model", "second-model"],
    );
    assert.equal(config.host, "127.0.0.1");
    assert.equal(config.port, 4000);
    assert.equal(config.galleryRoot, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("유효한 갤러리 절대 폴더만 설정한다", async () => {
  const root = await mkdtemp(join(tmpdir(), "llm-chat-config-"));
  const gallery = join(root, "gallery");
  try {
    await mkdir(gallery);
    await writeFile(
      join(root, "llm-models.json"),
      JSON.stringify([
        { apiKey: "secret", baseUrl: "https://example.test/v1", model: "model" },
      ]),
    );

    assert.equal(loadConfig(root, { GALLERY_ROOT: gallery }).galleryRoot, gallery);
    assert.throws(
      () => loadConfig(root, { GALLERY_ROOT: join(root, "missing") }),
      /GALLERY_ROOT/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("중복된 model 설정을 거부한다", async () => {
  const root = await mkdtemp(join(tmpdir(), "llm-chat-config-"));
  try {
    await writeFile(
      join(root, "llm-models.json"),
      JSON.stringify([
        {
          apiKey: "first-secret",
          baseUrl: "https://first.test/v1",
          model: "same-model",
        },
        {
          apiKey: "second-secret",
          baseUrl: "https://second.test/v1",
          model: "same-model",
        },
      ]),
    );

    assert.throws(() => loadConfig(root, {}), /중복/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
