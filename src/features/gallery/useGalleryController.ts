import { useCallback, useEffect, useRef, useState } from "react";
import type { GalleryPage } from "../../../shared/types/gallery.ts";
import { UI_TEXT } from "../../constants/uiText.ko.ts";
import { getGalleryPage } from "./galleryApi.ts";

export function useGalleryController(directoryId: string) {
  const [page, setPage] = useState<GalleryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const loadInitial = useCallback(() => {
    const version = ++requestVersion.current;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setPage(null);
    void getGalleryPage(directoryId, undefined, controller.signal)
      .then((result) => {
        if (requestVersion.current === version) setPage(result);
      })
      .catch((reason: unknown) => {
        if (
          requestVersion.current === version &&
          !(reason instanceof DOMException && reason.name === "AbortError")
        ) {
          setError(
            reason instanceof Error ? reason.message : UI_TEXT.errors.generic,
          );
        }
      })
      .finally(() => {
        if (requestVersion.current === version) setLoading(false);
      });
    return () => controller.abort();
  }, [directoryId]);

  useEffect(loadInitial, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (!page?.nextCursor || loadingMore) return;
    const version = requestVersion.current;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await getGalleryPage(directoryId, page.nextCursor);
      if (requestVersion.current !== version) return;
      setPage((current) =>
        current
          ? {
              ...current,
              items: [...current.items, ...result.items],
              nextCursor: result.nextCursor,
            }
          : result,
      );
    } catch (reason) {
      if (requestVersion.current === version) {
        setError(
          reason instanceof Error ? reason.message : UI_TEXT.errors.generic,
        );
      }
    } finally {
      if (requestVersion.current === version) setLoadingMore(false);
    }
  }, [directoryId, loadingMore, page]);

  return { page, loading, loadingMore, error, retry: loadInitial, loadMore };
}
