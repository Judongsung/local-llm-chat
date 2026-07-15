import type { GalleryItem } from "../../../../shared/types/gallery.ts";

export type GalleryViewerSession = {
  items: GalleryItem[];
  index: number;
};

export const GALLERY_VIEWER_PATH = "/gallery-viewer";

const GALLERY_VIEWER_SESSION_KEY = "gallery-viewer-session";
const ITEM_QUERY_PARAMETER = "item";

export function openGalleryViewerPage(items: GalleryItem[], index: number) {
  const item = items[index];
  if (!item) return;
  writeGalleryViewerSession({
    items,
    index,
  });
  window.location.assign(buildGalleryViewerUrl(item.id));
}

export function readGalleryViewerSession(): GalleryViewerSession | null {
  const serialized = window.sessionStorage.getItem(GALLERY_VIEWER_SESSION_KEY);
  if (!serialized) return null;
  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (!isGalleryViewerSession(parsed)) return null;
    const requestedItemId = new URLSearchParams(window.location.search).get(
      ITEM_QUERY_PARAMETER,
    );
    const requestedIndex = requestedItemId
      ? parsed.items.findIndex(({ id }) => id === requestedItemId)
      : -1;
    return {
      ...parsed,
      index: requestedIndex >= 0 ? requestedIndex : parsed.index,
    };
  } catch {
    return null;
  }
}

export function writeGalleryViewerSession(session: GalleryViewerSession) {
  window.sessionStorage.setItem(
    GALLERY_VIEWER_SESSION_KEY,
    JSON.stringify(session),
  );
}

export function replaceGalleryViewerItem(itemId: string) {
  window.history.replaceState(
    window.history.state,
    "",
    buildGalleryViewerUrl(itemId),
  );
}

function buildGalleryViewerUrl(itemId: string) {
  const query = new URLSearchParams({ [ITEM_QUERY_PARAMETER]: itemId });
  return `${GALLERY_VIEWER_PATH}?${query}`;
}

function isGalleryViewerSession(value: unknown): value is GalleryViewerSession {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<GalleryViewerSession>;
  return (
    Array.isArray(candidate.items) &&
    candidate.items.every(isGalleryItem) &&
    typeof candidate.index === "number" &&
    Number.isInteger(candidate.index) &&
    candidate.index >= 0 &&
    candidate.index < candidate.items.length
  );
}

function isGalleryItem(value: unknown): value is GalleryItem {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<GalleryItem>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    (candidate.kind === "image" || candidate.kind === "video") &&
    typeof candidate.mimeType === "string" &&
    typeof candidate.modifiedAt === "string" &&
    typeof candidate.size === "number" &&
    typeof candidate.mediaUrl === "string" &&
    (candidate.thumbnailUrl === undefined ||
      typeof candidate.thumbnailUrl === "string")
  );
}
