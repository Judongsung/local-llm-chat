# Source Map

## Frontend

- `src/app/` composes the application shell without owning chat behavior.
- `src/constants/ui.ts` owns user-visible labels, prompts, and accessibility
  text used by the frontend.
- `src/features/chat/` owns chat API access, optimistic stream state, UI
  orchestration, and chat-specific components and styles.

## Server

- `server/loadServerConfig.ts` loads the private model catalog; HTTP exposes
  model names without API keys or endpoint URLs.
- `server/chat/chatService.ts` owns chat use cases and generation lifecycle.
  HTTP and persistence depend on this boundary rather than each other.
- `server/chat/persistence/` owns parameter-profile and per-chat override JSON
  storage, validation, and effective-setting resolution.
- `server/llm/` defines the completion stream port and the OpenAI-compatible
  adapter.
- `server/http/` translates Express requests and errors into the existing API
  contract.

## Shared Contracts

- `shared/types/` owns cross-module data contracts, including browser-server
  and private LLM configuration shapes.
- `shared/constants/` owns HTTP, protocol, limit, and default values used across
  multiple modules.

## Request Flow

`chatApi → chatRouter → ChatService → ChatRepository | CompletionStreamer`
