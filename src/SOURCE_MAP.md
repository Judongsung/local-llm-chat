# Source Map

## Frontend

- `src/app/` composes the application shell without owning chat behavior.
- `src/app/AppSidebar.tsx` owns navigation between chat and gallery
  while retaining chat-list actions.
- `src/constants/` separates language-neutral UI contracts from Korean
  user-visible labels, prompts, formatters, and accessibility text in
  `*Text.ko.ts` files.
- `src/features/chat/` owns chat API access, optimistic stream state, UI
  orchestration, and chat-specific components and styles.
- `src/features/gallery/` owns read-only folder navigation, paged media state,
  and thumbnail grids.
- `src/features/gallery/viewer/` owns the full-document viewer, its browser
  navigation session, and viewer-only viewport and scroll styles.
- `src/galleryViewerMain.tsx` and `gallery-viewer.html` form a dedicated browser
  document entry so viewer viewport and scroll policies cannot affect the app
  shell.
- `src/features/gallery/viewer/galleryViewerNavigation.ts` hands loaded media
  to the full-document `/gallery-viewer` route so Safari does not switch root
  scroll modes inside the application shell.

## Server

- `server/loadServerConfig.ts` loads the private model catalog; HTTP exposes
  model names without API keys or endpoint URLs.
- `server/chat/chatService.ts` owns chat use cases and generation lifecycle.
  HTTP and persistence depend on this boundary rather than each other.
- `server/chat/persistence/` owns parameter-profile and per-chat override JSON
  storage, validation, and effective-setting resolution.
- `server/gallery/` owns the configured filesystem boundary, safe opaque path
  resolution, media listing, thumbnails, and inline media delivery.
- `server/errors/` defines transport-neutral application error categories used
  by domain services and mapped to responses by the HTTP layer.
- `server/llm/` defines the completion stream port and the OpenAI-compatible
  adapter.
- `server/http/` translates Express requests and errors into the existing API
  contract.

## Shared Contracts

- `shared/types/` owns cross-module data contracts, including browser-server
  and private LLM configuration shapes.
- `shared/constants/` separates language-neutral configuration and protocol
  contracts from Korean user/operator text in `*Text.ko.ts` files.

## Request Flow

`chatApi → chatRouter → ChatService → ChatRepository | CompletionStreamer`

`galleryApi → galleryRouter → GalleryService → configured local media root`
