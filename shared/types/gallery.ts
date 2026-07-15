export type GalleryMediaKind = "image" | "video";

export type GalleryStatus = {
  enabled: boolean;
};

export type GalleryDirectory = {
  id: string;
  name: string;
};

export type GalleryItem = {
  id: string;
  name: string;
  kind: GalleryMediaKind;
  mimeType: string;
  modifiedAt: string;
  size: number;
  mediaUrl: string;
  thumbnailUrl?: string;
};

export type GalleryPage = {
  directoryId: string;
  breadcrumbs: GalleryDirectory[];
  directories: GalleryDirectory[];
  items: GalleryItem[];
  nextCursor: string | null;
};
