import type {
  Chat,
  ChatSettings,
  ChatStageKey,
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
  onChangeSetting: (
    stage: ChatStageKey,
    key: keyof ChatSettings,
    value: ChatSettings[keyof ChatSettings],
  ) => void;
  onSelectProfile: (stage: ChatStageKey, profileId: string) => void;
  onSaveSettings: (stage: ChatStageKey) => void;
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
          chat={chat}
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
