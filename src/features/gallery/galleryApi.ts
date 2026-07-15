import { API_PATHS } from "../../../shared/constants/http.ts";
import type { GalleryPage, GalleryStatus } from "../../../shared/types/gallery.ts";
import { UI_TEXT_FORMATTERS } from "../../constants/uiText.ko.ts";

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      body?.error || UI_TEXT_FORMATTERS.requestFailed(response.status),
    );
  }
  return (await response.json()) as T;
}

export const getGalleryStatus = (signal?: AbortSignal) =>
  request<GalleryStatus>(API_PATHS.galleryStatus, signal);

export const getGalleryPage = (
  directoryId: string,
  cursor?: string,
  signal?: AbortSignal,
) => {
  const query = new URLSearchParams();
  if (directoryId) query.set("directory", directoryId);
  if (cursor) query.set("cursor", cursor);
  const suffix = query.size ? `?${query}` : "";
  return request<GalleryPage>(`${API_PATHS.gallery}${suffix}`, signal);
};
