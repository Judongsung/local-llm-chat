import { lazy, Suspense, useEffect, useState } from "react";
import { ChatHeader } from "../features/chat/ChatHeader.tsx";
import { ChatTypeDialog } from "../features/chat/ChatTypeDialog.tsx";
import { MessageComposer } from "../features/chat/MessageComposer.tsx";
import { MessageList } from "../features/chat/MessageList.tsx";
import { ProfileSettingsDialog } from "../features/chat/settings/ProfileSettingsDialog.tsx";
import { useChatController } from "../features/chat/useChatController.ts";
import { UI_SYMBOLS } from "../constants/ui.ts";
import { UI_TEXT } from "../constants/uiText.ko.ts";
import { getGalleryStatus } from "../features/gallery/galleryApi.ts";
import { AppSidebar } from "./AppSidebar.tsx";
import "../features/chat/shell.css";
import "../features/chat/chat.css";
import "../features/chat/settings/settings.css";

const GalleryScreen = lazy(
  () => import("../features/gallery/GalleryScreen.tsx"),
);
const CHAT_HASH = "#/chat";
const GALLERY_HASH_PREFIX = "#/gallery";

type AppView = "chat" | "gallery";

export default function App() {
  const controller = useChatController();
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [chatTypeOpen, setChatTypeOpen] = useState(false);
  const [activeView, setActiveView] = useState<AppView>(readView);
  const [galleryDirectoryId, setGalleryDirectoryId] = useState(
    readGalleryDirectory,
  );
  const [galleryEnabled, setGalleryEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    void getGalleryStatus(abortController.signal)
      .then(({ enabled }) => setGalleryEnabled(enabled))
      .catch(() => setGalleryEnabled(false));
    return () => abortController.abort();
  }, []);

  useEffect(() => {
    function syncRoute() {
      setActiveView(readView());
      setGalleryDirectoryId(readGalleryDirectory());
      controller.setSidebarOpen(false);
    }
    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, [controller.setSidebarOpen]);

  useEffect(() => {
    if (activeView === "chat" && controller.initialized && !controller.chat) {
      setChatTypeOpen(true);
    }
  }, [activeView, controller.initialized, controller.chat]);

  useEffect(() => {
    if (activeView === "gallery" && galleryEnabled === false) navigate(CHAT_HASH);
  }, [activeView, galleryEnabled]);

  return (
    <>
      <div
        className={
          controller.sidebarOpen ? "app-shell sidebar-open" : "app-shell"
        }
      >
        <button
          type="button"
          className="sidebar-backdrop"
          onClick={() => controller.setSidebarOpen(false)}
          aria-label={UI_TEXT.app.closeSidebar}
        />
        <AppSidebar
          activeView={activeView}
          chats={controller.chats}
          currentChatId={controller.chat?.id}
          busy={controller.busy}
          profilesReady={controller.profileCatalog.profiles.length > 0}
          galleryEnabled={galleryEnabled === true}
          onAdd={() => {
            controller.setSidebarOpen(false);
            navigate(CHAT_HASH);
            setChatTypeOpen(true);
          }}
          onOpenChat={(id) => {
            navigate(CHAT_HASH);
            void controller.openChat(id);
          }}
          onOpenGallery={() => {
            controller.setSidebarOpen(false);
            navigate(GALLERY_HASH_PREFIX);
          }}
          onDelete={controller.removeChat}
          onOpenProfiles={() => {
            controller.setSidebarOpen(false);
            setProfilesOpen(true);
          }}
          onClose={() => controller.setSidebarOpen(false)}
        />

        {activeView === "chat" ? (
          <main className="chat-panel">
            <ChatHeader
              chat={controller.chat}
              busy={controller.busy}
              profiles={controller.profileCatalog.profiles}
              models={controller.models}
              sidebarOpen={controller.sidebarOpen}
              onOpenSidebar={() => controller.setSidebarOpen(true)}
              onChangeSetting={controller.changeSetting}
              onSelectProfile={controller.chooseProfile}
              onSaveSettings={controller.saveSettings}
            />

            {controller.error ? (
              <div className="error-banner" role="alert">
                <span>{controller.error}</span>
                <button
                  type="button"
                  onClick={controller.clearError}
                  aria-label={UI_TEXT.app.closeError}
                >
                  {UI_SYMBOLS.close}
                </button>
              </div>
            ) : (
              <div className="error-placeholder" aria-hidden="true" />
            )}

            <MessageList
              chat={controller.chat}
              busy={controller.busy}
              activeStage={controller.activeStage}
              activeMessageId={controller.activeMessageId}
              activeSourceMessageId={controller.activeSourceMessageId}
              onEdit={controller.editPrompt}
              onDelete={controller.removePrompt}
              onRetryTranslation={(sourceMessageId) =>
                void controller.retryTranslation(sourceMessageId)
              }
            />
            <MessageComposer
              draft={controller.draft}
              attachments={controller.attachments}
              disabled={!controller.chat}
              busy={controller.busy}
              onDraftChange={controller.setDraft}
              onAttachmentsChange={controller.setAttachments}
              onSend={controller.sendMessage}
              onStop={controller.stopMessage}
            />
          </main>
        ) : (
          <Suspense
            fallback={
              <main className="gallery-panel">
                <div className="gallery-state">{UI_TEXT.gallery.loading}</div>
              </main>
            }
          >
            <GalleryScreen
              directoryId={galleryDirectoryId}
              sidebarOpen={controller.sidebarOpen}
              onOpenSidebar={() => controller.setSidebarOpen(true)}
              onOpenDirectory={(id) =>
                navigate(`${GALLERY_HASH_PREFIX}${id ? `/${id}` : ""}`)
              }
            />
          </Suspense>
        )}
      </div>
      {profilesOpen && (
        <ProfileSettingsDialog
          catalog={controller.profileCatalog}
          models={controller.models}
          busy={controller.busy}
          error={controller.error}
          onClose={() => setProfilesOpen(false)}
          onCreate={controller.addProfile}
          onUpdate={controller.editProfile}
          onDelete={controller.removeProfile}
        />
      )}
      {chatTypeOpen && (
        <ChatTypeDialog
          busy={controller.busy}
          onClose={() => setChatTypeOpen(false)}
          onCreate={controller.addChat}
        />
      )}
    </>
  );
}

function readView(): AppView {
  return window.location.hash.startsWith(GALLERY_HASH_PREFIX)
    ? "gallery"
    : "chat";
}

function readGalleryDirectory() {
  const hash = window.location.hash;
  return hash.startsWith(`${GALLERY_HASH_PREFIX}/`)
    ? hash.slice(GALLERY_HASH_PREFIX.length + 1)
    : "";
}

function navigate(hash: string) {
  if (window.location.hash === hash) {
    window.dispatchEvent(new Event("hashchange"));
  } else {
    window.location.hash = hash;
  }
}
