import { useEffect, useRef } from "react";
import type { GalleryItem } from "../../../shared/types/gallery.ts";
import { UI_SYMBOLS } from "../../constants/ui.ts";
import { UI_TEXT } from "../../constants/uiText.ko.ts";
import { useGalleryController } from "./useGalleryController.ts";
import { openGalleryViewerPage } from "./viewer/galleryViewerNavigation.ts";
import "./gallery.css";

type Props = {
  directoryId: string;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  onOpenDirectory: (id: string) => void;
};

export default function GalleryScreen({
  directoryId,
  sidebarOpen,
  onOpenSidebar,
  onOpenDirectory,
}: Props) {
  const controller = useGalleryController(directoryId);
  const loadMoreTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = loadMoreTarget.current;
    if (!target || !controller.page?.nextCursor || !("IntersectionObserver" in window)) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some(({ isIntersecting }) => isIntersecting)) {
        void controller.loadMore();
      }
    }, { rootMargin: "240px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [controller.loadMore, controller.page?.nextCursor]);

  const items = controller.page?.items ?? [];

  return (
    <main className="gallery-panel">
      <header className="gallery-header">
        <button
          type="button"
          className="menu-button"
          onClick={onOpenSidebar}
          aria-controls="app-sidebar"
          aria-expanded={sidebarOpen}
          aria-label={UI_TEXT.header.openSidebar}
        >
          {UI_SYMBOLS.menu}
        </button>
        <h2>{UI_TEXT.gallery.title}</h2>
      </header>

      {controller.error && (
        <div className="gallery-error" role="alert">
          <span>{controller.error}</span>
          <button type="button" onClick={controller.retry}>{UI_TEXT.gallery.retry}</button>
        </div>
      )}

      <div className="gallery-content">
        {controller.loading ? (
          <div className="gallery-state">{UI_TEXT.gallery.loading}</div>
        ) : controller.page ? (
          <>
            <nav className="gallery-breadcrumbs" aria-label={UI_TEXT.gallery.breadcrumbs}>
              {controller.page.breadcrumbs.map((entry, index) => (
                <span key={entry.id || "root"}>
                  {index > 0 && <span aria-hidden="true">{UI_SYMBOLS.next}</span>}
                  <button type="button" onClick={() => onOpenDirectory(entry.id)}>
                    {entry.name}
                  </button>
                </span>
              ))}
            </nav>

            {controller.page.directories.length > 0 && (
              <section className="gallery-folders" aria-label={UI_TEXT.gallery.folders}>
                {controller.page.directories.map((directory) => (
                  <button type="button" key={directory.id} onClick={() => onOpenDirectory(directory.id)}>
                    <span aria-hidden="true">{UI_SYMBOLS.folder}</span>
                    <span>{directory.name}</span>
                    <span aria-hidden="true">{UI_SYMBOLS.next}</span>
                  </button>
                ))}
              </section>
            )}

            {items.length > 0 ? (
              <section className="gallery-grid" aria-label={UI_TEXT.gallery.media}>
                {items.map((item, index) => (
                  <MediaTile
                    item={item}
                    key={item.id}
                    onOpen={() => openGalleryViewerPage(items, index)}
                  />
                ))}
              </section>
            ) : controller.page.directories.length === 0 ? (
              <div className="gallery-state">{UI_TEXT.gallery.empty}</div>
            ) : null}

            <div className="gallery-load-more" ref={loadMoreTarget}>
              {controller.page.nextCursor && (
                <button type="button" disabled={controller.loadingMore} onClick={() => void controller.loadMore()}>
                  {controller.loadingMore ? UI_TEXT.gallery.loadingMore : UI_TEXT.gallery.loadMore}
                </button>
              )}
            </div>
          </>
        ) : null}
      </div>

    </main>
  );
}

function MediaTile({ item, onOpen }: { item: GalleryItem; onOpen: () => void }) {
  return (
    <button type="button" className="gallery-tile" onClick={onOpen} aria-label={item.name}>
      {item.kind === "image" ? (
        <img src={item.thumbnailUrl} alt="" loading="lazy" decoding="async" />
      ) : (
        <span className="gallery-video-tile">
          <span aria-hidden="true">{UI_SYMBOLS.play}</span>
          <small>{item.name}</small>
        </span>
      )}
    </button>
  );
}
