import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GalleryPage } from "../../../shared/types/gallery.ts";
import GalleryScreen from "./GalleryScreen.tsx";

const navigationMocks = vi.hoisted(() => ({
  openGalleryViewerPage: vi.fn(),
}));

vi.mock("./viewer/galleryViewerNavigation.ts", () => navigationMocks);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  navigationMocks.openGalleryViewerPage.mockReset();
});

describe("GalleryScreen", () => {
  it("폴더를 탐색하고 미디어를 전용 뷰어 페이지로 연다", async () => {
    const onOpenDirectory = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(page), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    render(
      <GalleryScreen
        directoryId=""
        sidebarOpen={false}
        onOpenSidebar={vi.fn()}
        onOpenDirectory={onOpenDirectory}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "여행" }));
    expect(onOpenDirectory).toHaveBeenCalledWith("folder-id");

    fireEvent.click(screen.getByRole("button", { name: "사진.jpg" }));
    expect(navigationMocks.openGalleryViewerPage).toHaveBeenCalledWith(
      page.items,
      0,
    );
    expect(
      screen.queryByRole("dialog", { name: "미디어 전체 화면" }),
    ).toBeNull();
  });
});

const page: GalleryPage = {
  directoryId: "",
  breadcrumbs: [{ id: "", name: "갤러리" }],
  directories: [{ id: "folder-id", name: "여행" }],
  items: [
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
  ],
  nextCursor: null,
};
