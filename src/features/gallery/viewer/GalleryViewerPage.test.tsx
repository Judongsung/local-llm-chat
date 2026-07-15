import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GalleryItem } from "../../../../shared/types/gallery.ts";
import {
  readGalleryViewerSession,
  writeGalleryViewerSession,
} from "./galleryViewerNavigation.ts";
import GalleryViewerPage from "./GalleryViewerPage.tsx";

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/gallery-viewer?item=image-id");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("GalleryViewerPage", () => {
  it("전달된 미디어를 문서형 뷰어에서 전환하고 원래 갤러리로 돌아간다", () => {
    writeGalleryViewerSession({
      items,
      index: 0,
    });
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const historyBack = vi.spyOn(window.history, "back").mockImplementation(() => {});

    const { container } = render(<GalleryViewerPage />);
    const viewer = screen.getByRole("dialog", { name: "미디어 전체 화면" });
    const image = screen.getByRole("img", { name: "사진.jpg" });
    const stage = container.querySelector<HTMLElement>(".gallery-viewer-stage");
    const mediaFrame = container.querySelector<HTMLElement>(
      ".gallery-viewer-media-frame",
    );
    expect(stage).not.toBeNull();
    expect(mediaFrame).not.toBeNull();
    if (!stage || !mediaFrame) return;
    Object.defineProperties(stage, {
      clientWidth: { configurable: true, value: 375 },
      clientHeight: { configurable: true, value: 812 },
    });
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 1200 },
      naturalHeight: { configurable: true, value: 2400 },
    });
    fireEvent.resize(window);
    fireEvent.load(image);

    fireEvent.click(image);
    expect(viewer.classList.contains("gallery-viewer-immersive")).toBe(true);
    expect(mediaFrame.style.aspectRatio).toBe("1200 / 2400");
    expect(viewer.querySelector(".gallery-viewer-backdrop")).not.toBeNull();
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0);

    fireEvent.click(image);
    fireEvent.click(
      screen.getByRole("button", { name: "시계 방향으로 90도 회전" }),
    );
    expect(image.style.transform).toBe("rotate(90deg)");
    expect(image.style.width).toBe("812px");
    expect(image.style.height).toBe("375px");

    fireEvent.click(screen.getByRole("button", { name: "다음 미디어" }));
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(window.location.search).toBe("?item=video-id");
    expect(readGalleryViewerSession()?.index).toBe(1);
    expect(video?.getAttribute("playsinline")).not.toBeNull();
    expect(video?.getAttribute("preload")).toBe("metadata");

    fireEvent.click(screen.getByRole("button", { name: "전체 화면 닫기" }));
    expect(historyBack).toHaveBeenCalledOnce();
  });

  it("전달 정보가 없으면 갤러리 복귀 화면을 표시한다", () => {
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(<GalleryViewerPage />);

    expect(
      screen.getByText("열려던 미디어 정보를 찾을 수 없습니다."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "갤러리로 돌아가기" }));
    expect(window.history.back).toHaveBeenCalledOnce();
  });
});

const items: GalleryItem[] = [
  {
    id: "image-id",
    name: "사진.jpg",
    kind: "image",
    mimeType: "image/jpeg",
    modifiedAt: "2026-01-01T00:00:00.000Z",
    size: 100,
    mediaUrl: "/api/gallery/media/image-id",
    thumbnailUrl: "/api/gallery/thumbnails/image-id?v=1",
  },
  {
    id: "video-id",
    name: "영상.mp4",
    kind: "video",
    mimeType: "video/mp4",
    modifiedAt: "2026-01-01T00:00:00.000Z",
    size: 200,
    mediaUrl: "/api/gallery/media/video-id",
  },
];
