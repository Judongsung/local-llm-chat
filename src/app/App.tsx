import { useState } from "react";
import { ChatHeader } from "../features/chat/components/ChatHeader.tsx";
import { ChatSidebar } from "../features/chat/components/ChatSidebar.tsx";
import { MessageComposer } from "../features/chat/components/MessageComposer.tsx";
import { MessageList } from "../features/chat/components/MessageList.tsx";
import { ProfileSettingsDialog } from "../features/chat/components/ProfileSettingsDialog.tsx";
import { useChatController } from "../features/chat/useChatController.ts";
import { UI_SYMBOLS, UI_TEXT } from "../constants/ui.ts";
import "../features/chat/styles/shell.css";
import "../features/chat/styles/chat.css";
import "../features/chat/styles/settings.css";

export default function App() {
  const controller = useChatController();
  const [profilesOpen, setProfilesOpen] = useState(false);

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
        <ChatSidebar
          chats={controller.chats}
          currentChatId={controller.chat?.id}
          busy={controller.busy}
          profilesReady={controller.profileCatalog.profiles.length > 0}
          onAdd={controller.addChat}
          onOpen={controller.openChat}
          onDelete={controller.removeChat}
          onOpenProfiles={() => {
            controller.setSidebarOpen(false);
            setProfilesOpen(true);
          }}
          onClose={() => controller.setSidebarOpen(false)}
        />

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
            onEdit={controller.editPrompt}
            onDelete={controller.removePrompt}
          />
          <MessageComposer
            draft={controller.draft}
            disabled={!controller.chat}
            busy={controller.busy}
            onDraftChange={controller.setDraft}
            onSend={controller.sendMessage}
            onStop={controller.stopMessage}
          />
        </main>
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
    </>
  );
}
