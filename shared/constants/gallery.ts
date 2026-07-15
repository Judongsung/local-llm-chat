import type { GalleryMediaKind } from "../types/gallery.ts";

export const GALLERY_LIMITS = {
  pageSize: 60,
  thumbnailPixels: 384,
  thumbnailQuality: 75,
  swipeThresholdPixels: 72,
  swipeAxisDominanceRatio: 1.5,
  tapMovementTolerancePixels: 12,
  swipeClickDelayMs: 500,
} as const;

export const GALLERY_THUMBNAIL = {
  mimeType: "image/webp",
  cacheControl: "private, max-age=31536000, immutable",
} as const;

export const GALLERY_MEDIA_TYPES = {
  ".jpg": { kind: "image", mimeType: "image/jpeg" },
  ".jpeg": { kind: "image", mimeType: "image/jpeg" },
  ".png": { kind: "image", mimeType: "image/png" },
  ".webp": { kind: "image", mimeType: "image/webp" },
  ".gif": { kind: "image", mimeType: "image/gif" },
  ".mp4": { kind: "video", mimeType: "video/mp4" },
  ".mov": { kind: "video", mimeType: "video/quicktime" },
  ".m4v": { kind: "video", mimeType: "video/x-m4v" },
} as const satisfies Record<
  string,
  { kind: GalleryMediaKind; mimeType: string }
>;
