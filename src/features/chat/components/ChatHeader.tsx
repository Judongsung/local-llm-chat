import type {
  Chat,
  ChatParameters,
  ParameterProfile,
} from "../../../../shared/types/chat.ts";
import { UI_SYMBOLS, UI_TEXT } from "../../../constants/ui.ts";
import { ChatSettingsPanel } from "./ChatSettingsPanel.tsx";

type Props = {
  chat: Chat | null;
  busy: boolean;
  profiles: ParameterProfile[];
  models: string[];
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  onChangeSetting: <K extends keyof ChatParameters>(
    key: K,
    value: ChatParameters[K],
  ) => void;
  onSelectProfile: (profileId: string) => void;
  onSaveSettings: () => void;
};

export function ChatHeader({
  chat,
  busy,
  profiles,
  models,
  sidebarOpen,
  onOpenSidebar,
  onChangeSetting,
  onSelectProfile,
  onSaveSettings,
}: Props) {
  return (
    <header className="chat-header">
      <div className="chat-title">
        <button
          type="button"
          className="menu-button"
          onClick={onOpenSidebar}
          aria-controls="chat-sidebar"
          aria-expanded={sidebarOpen}
          aria-label={UI_TEXT.header.openSidebar}
        >
          {UI_SYMBOLS.menu}
        </button>
        <h2>{chat?.title || UI_TEXT.header.loadingChat}</h2>
      </div>
      {chat && (
        <ChatSettingsPanel
          settings={chat.settings}
          profileId={chat.profileId}
          profileFallback={chat.profileFallback}
          profiles={profiles}
          models={models}
          busy={busy}
          onChange={onChangeSetting}
          onSelectProfile={onSelectProfile}
          onSave={onSaveSettings}
        />
      )}
    </header>
  );
}
