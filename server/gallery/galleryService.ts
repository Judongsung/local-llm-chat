import { lstat, readdir, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, relative, sep } from "node:path";
import sharp from "sharp";
import {
  GALLERY_LIMITS,
  GALLERY_MEDIA_TYPES,
} from "../../shared/constants/gallery.ts";
import { GALLERY_ROOT_NAME } from "../../shared/constants/galleryText.ko.ts";
import { API_PATHS } from "../../shared/constants/http.ts";
import { SERVER_ERROR_MESSAGES } from "../../shared/constants/serverText.ko.ts";
import {
  ApplicationError,
  applicationError,
} from "../errors/applicationError.ts";
import type {
  GalleryDirectory,
  GalleryItem,
  GalleryMediaKind,
  GalleryPage,
} from "../../shared/types/gallery.ts";

const HIDDEN_NAME_PREFIX = ".";
const PATH_SEPARATOR = "/";
const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]*$/;
const collator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });

type MediaType = { kind: GalleryMediaKind; mimeType: string };

export class GalleryService {
  private readonly root: string | null;

  constructor(root: string | null) {
    this.root = root;
  }

  get enabled() {
    return this.root !== null;
  }

  async list(directoryId = "", cursor?: string): Promise<GalleryPage> {
    const directory = await this.resolveEntry(directoryId, "directory");
    const entries = await readdir(directory.absolutePath, {
      withFileTypes: true,
    });
    const directories: GalleryDirectory[] = [];
    const items: GalleryItem[] = [];

    await Promise.all(
      entries.map(async (entry) => {
        if (entry.name.startsWith(HIDDEN_NAME_PREFIX) || entry.isSymbolicLink()) {
          return;
        }
        const relativePath = appendRelativePath(
          directory.relativePath,
          entry.name,
        );
        if (entry.isDirectory()) {
          directories.push({ id: encodeId(relativePath), name: entry.name });
          return;
        }
        if (!entry.isFile()) return;
        const mediaType = mediaTypeFor(entry.name);
        if (!mediaType) return;
        const metadata = await stat(join(directory.absolutePath, entry.name));
        const id = encodeId(relativePath);
        items.push({
          id,
          name: entry.name,
          kind: mediaType.kind,
          mimeType: mediaType.mimeType,
          modifiedAt: metadata.mtime.toISOString(),
          size: metadata.size,
          mediaUrl: `${API_PATHS.gallery}/media/${id}`,
          ...(mediaType.kind === "image"
            ? {
                thumbnailUrl: `${API_PATHS.gallery}/thumbnails/${id}?v=${Math.trunc(metadata.mtimeMs)}`,
              }
            : {}),
        });
      }),
    );

    directories.sort((left, right) => collator.compare(left.name, right.name));
    items.sort(
      (left, right) =>
        Date.parse(right.modifiedAt) - Date.parse(left.modifiedAt) ||
        collator.compare(left.name, right.name),
    );
    const offset = decodeCursor(cursor);
    const pageItems = items.slice(offset, offset + GALLERY_LIMITS.pageSize);
    const nextOffset = offset + pageItems.length;

    return {
      directoryId,
      breadcrumbs: breadcrumbsFor(directory.relativePath),
      directories,
      items: pageItems,
      nextCursor: nextOffset < items.length ? encodeCursor(nextOffset) : null,
    };
  }

  async media(id: string) {
    const entry = await this.resolveEntry(id, "file");
    const mediaType = mediaTypeFor(entry.absolutePath);
    if (!mediaType) {
      throw applicationError.badRequest(
        SERVER_ERROR_MESSAGES.unsupportedGalleryMedia,
      );
    }
    return { ...entry, ...mediaType };
  }

  async thumbnail(id: string) {
    const media = await this.media(id);
    if (media.kind !== "image") {
      throw applicationError.badRequest(
        SERVER_ERROR_MESSAGES.unsupportedGalleryMedia,
      );
    }
    return sharp(media.absolutePath)
      .rotate()
      .resize(GALLERY_LIMITS.thumbnailPixels, GALLERY_LIMITS.thumbnailPixels, {
        fit: "cover",
        position: "centre",
      })
      .webp({ quality: GALLERY_LIMITS.thumbnailQuality })
      .toBuffer();
  }

  private async resolveEntry(id: string, expected: "directory" | "file") {
    if (!this.root) {
      throw applicationError.notFound(SERVER_ERROR_MESSAGES.galleryDisabled);
    }
    const relativePath = decodeId(id);
    const segments = relativePath ? relativePath.split(PATH_SEPARATOR) : [];
    let candidate = this.root;
    try {
      for (const segment of segments) {
        candidate = join(candidate, segment);
        if ((await lstat(candidate)).isSymbolicLink()) {
          throw invalidGalleryPath();
        }
      }
      const canonicalPath = await realpath(candidate);
      assertInsideRoot(this.root, canonicalPath);
      const metadata = await stat(canonicalPath);
      if (
        (expected === "directory" && !metadata.isDirectory()) ||
        (expected === "file" && !metadata.isFile())
      ) {
        throw galleryEntryNotFound();
      }
      return { absolutePath: canonicalPath, relativePath };
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw galleryEntryNotFound();
    }
  }
}

function mediaTypeFor(path: string): MediaType | null {
  const extension = extname(path).toLowerCase();
  return (
    GALLERY_MEDIA_TYPES[extension as keyof typeof GALLERY_MEDIA_TYPES] ?? null
  );
}

function appendRelativePath(parent: string, name: string) {
  return parent ? `${parent}${PATH_SEPARATOR}${name}` : name;
}

function encodeId(relativePath: string) {
  return Buffer.from(relativePath, "utf8").toString("base64url");
}

function decodeId(id: string) {
  if (!BASE64_URL_PATTERN.test(id)) throw invalidGalleryPath();
  const value = Buffer.from(id, "base64url").toString("utf8");
  if (encodeId(value) !== id || value.includes("\0") || value.includes("\\")) {
    throw invalidGalleryPath();
  }
  const segments = value ? value.split(PATH_SEPARATOR) : [];
  if (
    isAbsolute(value) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw invalidGalleryPath();
  }
  return value;
}

function assertInsideRoot(root: string, candidate: string) {
  const pathFromRoot = relative(root, candidate);
  if (
    pathFromRoot.startsWith(`..${sep}`) ||
    pathFromRoot === ".." ||
    isAbsolute(pathFromRoot)
  ) {
    throw invalidGalleryPath();
  }
}

function breadcrumbsFor(relativePath: string): GalleryDirectory[] {
  const breadcrumbs: GalleryDirectory[] = [{ id: "", name: GALLERY_ROOT_NAME }];
  if (!relativePath) return breadcrumbs;
  let current = "";
  for (const name of relativePath.split(PATH_SEPARATOR)) {
    current = appendRelativePath(current, name);
    breadcrumbs.push({ id: encodeId(current), name });
  }
  return breadcrumbs;
}

function encodeCursor(offset: number) {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return 0;
  if (!BASE64_URL_PATTERN.test(cursor)) throw invalidGalleryPath();
  const raw = Buffer.from(cursor, "base64url").toString("utf8");
  const offset = Number(raw);
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    encodeCursor(offset) !== cursor
  ) {
    throw invalidGalleryPath();
  }
  return offset;
}

function invalidGalleryPath() {
  return applicationError.badRequest(SERVER_ERROR_MESSAGES.invalidGalleryPath);
}

function galleryEntryNotFound() {
  return applicationError.notFound(SERVER_ERROR_MESSAGES.galleryEntryNotFound);
}
