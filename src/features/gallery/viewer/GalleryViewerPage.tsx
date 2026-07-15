import { useEffect, useState } from "react";
import { UI_TEXT } from "../../../constants/uiText.ko.ts";
import {
  readGalleryViewerSession,
  replaceGalleryViewerItem,
  writeGalleryViewerSession,
  type GalleryViewerSession,
} from "./galleryViewerNavigation.ts";
import { GalleryViewer } from "./GalleryViewer.tsx";

export default function GalleryViewerPage() {
  const [session, setSession] = useState<GalleryViewerSession | null>(
    readGalleryViewerSession,
  );
  const item = session?.items[session.index];

  useEffect(() => {
    if (!item) return;
    document.title = item.name;
  }, [item]);

  if (!session || !item) {
    return (
      <main className="gallery-viewer-unavailable">
        <p>{UI_TEXT.gallery.viewerUnavailable}</p>
        <button type="button" onClick={() => window.history.back()}>
          {UI_TEXT.gallery.backToGallery}
        </button>
      </main>
    );
  }

  function changeItem(index: number) {
    if (!session) return;
    const nextItem = session.items[index];
    if (!nextItem) return;
    const nextSession = { ...session, index };
    writeGalleryViewerSession(nextSession);
    replaceGalleryViewerItem(nextItem.id);
    setSession(nextSession);
  }

  return (
    <GalleryViewer
      items={session.items}
      index={session.index}
      onChange={changeItem}
      onClose={() => window.history.back()}
    />
  );
}
