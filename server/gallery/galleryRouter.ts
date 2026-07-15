import { Router } from "express";
import { GALLERY_THUMBNAIL } from "../../shared/constants/gallery.ts";
import { API_PATHS } from "../../shared/constants/http.ts";
import type { GalleryService } from "./galleryService.ts";

const DIRECTORY_QUERY_KEY = "directory";
const CURSOR_QUERY_KEY = "cursor";
const MEDIA_CACHE_MAX_AGE = 0;
const MEDIA_DOTFILE_POLICY = "allow";

export function createGalleryRouter(service: GalleryService) {
  const router = Router();

  router.get(API_PATHS.galleryStatus, (_request, response) => {
    response.json({ enabled: service.enabled });
  });

  router.get(API_PATHS.gallery, async (request, response) => {
    const directory = queryString(request.query[DIRECTORY_QUERY_KEY]);
    const cursor = queryString(request.query[CURSOR_QUERY_KEY]);
    response.json(await service.list(directory, cursor));
  });

  router.get(`${API_PATHS.gallery}/media/:id`, async (request, response) => {
    const media = await service.media(request.params.id);
    response.type(media.mimeType);
    response.sendFile(media.absolutePath, {
      acceptRanges: true,
      cacheControl: true,
      // GalleryService가 루트와 dot 항목을 검증하므로 상위 경로의 dot 폴더는 허용한다.
      dotfiles: MEDIA_DOTFILE_POLICY,
      lastModified: true,
      maxAge: MEDIA_CACHE_MAX_AGE,
    });
  });

  router.get(
    `${API_PATHS.gallery}/thumbnails/:id`,
    async (request, response) => {
      const thumbnail = await service.thumbnail(request.params.id);
      response
        .set("Cache-Control", GALLERY_THUMBNAIL.cacheControl)
        .type(GALLERY_THUMBNAIL.mimeType)
        .send(thumbnail);
    },
  );

  return router;
}

function queryString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
