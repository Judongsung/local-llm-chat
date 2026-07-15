import { createRoot } from "react-dom/client";
import GalleryViewerPage from "./features/gallery/viewer/GalleryViewerPage.tsx";
import "./features/gallery/viewer/galleryViewer.css";

const APP_ROOT_ELEMENT_ID = "root";

createRoot(document.getElementById(APP_ROOT_ELEMENT_ID)!).render(
  <GalleryViewerPage />,
);
