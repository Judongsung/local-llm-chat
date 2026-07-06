import type { FormEvent } from "react";
import type {
  ChatParameters,
  ChatSettings,
  ParameterProfile,
} from "../../../../shared/types/chat.ts";
import { UI_TEXT } from "../../../constants/ui.ts";
import { formatSettingsTitle } from "../../../utils/formatUiText.ts";
import { ParameterFields } from "./ParameterFields.tsx";

type Props = {
  settings: ChatSettings;
  profileId: string;
  profileFallback: boolean;
  profiles: ParameterProfile[];
  models: string[];
  busy: boolean;
  onChange: <K extends keyof ChatParameters>(
    key: K,
    value: ChatParameters[K],
  ) => void;
  onSelectProfile: (profileId: string) => void;
  onSave: () => void;
};

export function ChatSettingsPanel({
  settings,
  profileId,
  profileFallback,
  profiles,
  models,
  busy,
  onChange,
  onSelectProfile,
  onSave,
}: Props) {
  const profile = profiles.find((item) => item.id === profileId);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave();
  }

  return (
    <details className="settings">
      <summary>{formatSettingsTitle(profile?.name)}</summary>
      <form onSubmit={submit}>
        {profileFallback && (
          <p className="profile-warning" role="status">
            {UI_TEXT.settings.fallback}
          </p>
        )}
        <label>
          {UI_TEXT.settings.profile}
          <select
            value={profileId}
            onChange={(event) => onSelectProfile(event.target.value)}
            disabled={busy}
          >
            {profiles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {UI_TEXT.settings.systemPrompt}
          <textarea value={settings.systemPrompt} rows={4} readOnly />
        </label>
        <ParameterFields
          settings={settings}
          models={models}
          disabled={busy}
          onChange={onChange}
        />
        <button type="submit" disabled={busy}>
          {UI_TEXT.settings.save}
        </button>
      </form>
    </details>
  );
}
