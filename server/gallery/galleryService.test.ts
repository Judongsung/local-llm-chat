import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  APPLICATION_ERROR_KIND,
  ApplicationError,
} from "../errors/applicationError.ts";
import { GalleryService } from "./galleryService.ts";

const encodeId = (path: string) => Buffer.from(path).toString("base64url");

test("폴더와 지원 미디어만 노출하고 이미지 썸네일을 생성한다", async () => {
  const root = await mkdtemp(join(tmpdir(), "llm-chat-gallery-"));
  try {
    await mkdir(join(root, "앨범"));
    await sharp({
      create: { width: 800, height: 600, channels: 3, background: "#ff8844" },
    })
      .jpeg()
      .toFile(join(root, "사진.jpg"));
    await writeFile(join(root, "영상.mp4"), "test-video");
    await writeFile(join(root, "메모.txt"), "not-media");
    await writeFile(join(root, ".숨김.jpg"), "hidden");

    const service = new GalleryService(root);
    const page = await service.list();

    assert.equal(service.enabled, true);
    assert.deepEqual(page.directories.map(({ name }) => name), ["앨범"]);
    assert.deepEqual(
      page.items.map(({ name, kind }) => [name, kind]),
      [
        ["영상.mp4", "video"],
        ["사진.jpg", "image"],
      ],
    );
    assert.equal(page.breadcrumbs[0].name, "갤러리");
    assert.equal(page.items.find(({ kind }) => kind === "video")?.thumbnailUrl, undefined);

    const image = page.items.find(({ kind }) => kind === "image");
    assert.ok(image);
    const thumbnail = await service.thumbnail(image.id);
    const metadata = await sharp(thumbnail).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 384);
    assert.equal(metadata.height, 384);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("opaque ID가 갤러리 루트 밖을 가리키지 못하게 한다", async () => {
  const root = await mkdtemp(join(tmpdir(), "llm-chat-gallery-"));
  try {
    const service = new GalleryService(root);
    await assert.rejects(
      () => service.media(encodeId("../outside.jpg")),
      isBadRequest,
    );
    await assert.rejects(
      () => service.list("not+base64"),
      isBadRequest,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function isBadRequest(error: unknown) {
  return (
    error instanceof ApplicationError &&
    error.kind === APPLICATION_ERROR_KIND.badRequest
  );
}
