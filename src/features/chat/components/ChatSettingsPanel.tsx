import type { FormEvent } from "react";
import type {
  Chat,
  ChatParameters,
  ChatSettings,
  ChatStage,
  ChatStageKey,
  ParameterProfile,
} from "../../../../shared/types/chat.ts";
import {
  CHAT_LIMITS,
  CHAT_MODE,
  CHAT_STAGE,
} from "../../../../shared/constants/chat.ts";
import { UI_TEXT, UI_TEXT_FORMATTERS } from "../../../constants/ui.ts";
import { ParameterFields } from "./ParameterFields.tsx";

const SYSTEM_PROMPT_ROWS = 4;

type Props = {
  chat: Chat;
  profiles: ParameterProfile[];
  models: string[];
  busy: boolean;
  onChange: (
    stage: ChatStageKey,
    key: keyof ChatSettings,
    value: ChatSettings[keyof ChatSettings],
  ) => void;
  onSelectProfile: (stage: ChatStageKey, profileId: string) => void;
  onSave: (stage: ChatStageKey) => void;
};

export function ChatSettingsPanel({
  chat,
  profiles,
  models,
  busy,
  onChange,
  onSelectProfile,
  onSave,
}: Props) {
  const generationProfile = profiles.find(
    (profile) => profile.id === chat.stages.generation.profileId,
  );

  return (
    <details className="settings">
      <summary>
        {UI_TEXT_FORMATTERS.settingsTitle(generationProfile?.name)}
      </summary>
      <div className="settings-panel">
        <StageSettingsForm
          stage={CHAT_STAGE.generation}
          title={
            chat.mode === CHAT_MODE.translation
              ? UI_TEXT.settings.generationTitle
              : undefined
          }
          data={chat.stages.generation}
          profiles={profiles}
          models={models}
          busy={busy}
          onChange={onChange}
          onSelectProfile={onSelectProfile}
          onSave={onSave}
        />
        {chat.mode === CHAT_MODE.translation && (
          <StageSettingsForm
            stage={CHAT_STAGE.translation}
            title={UI_TEXT.settings.translationTitle}
            data={chat.stages.translation}
            profiles={profiles}
            models={models}
            busy={busy}
            onChange={onChange}
            onSelectProfile={onSelectProfile}
            onSave={onSave}
          />
        )}
      </div>
    </details>
  );
}

function StageSettingsForm({
  stage,
  title,
  data,
  profiles,
  models,
  busy,
  onChange,
  onSelectProfile,
  onSave,
}: {
  stage: ChatStageKey;
  title?: string;
  data: ChatStage;
  profiles: ParameterProfile[];
  models: string[];
  busy: boolean;
  onChange: Props["onChange"];
  onSelectProfile: Props["onSelectProfile"];
  onSave: Props["onSave"];
}) {
  function submit(event: FormEvent) {
    event.preventDefault();
    onSave(stage);
  }

  function changeParameter<K extends keyof ChatParameters>(
    key: K,
    value: ChatParameters[K],
  ) {
    onChange(stage, key, value);
  }

  return (
    <form onSubmit={submit}>
      {title && <h3>{title}</h3>}
      {data.profileFallback && (
        <p className="profile-warning" role="status">
          {UI_TEXT.settings.fallback}
        </p>
      )}
      <label>
        {UI_TEXT.settings.profile}
        <select
          value={data.profileId}
          onChange={(event) => onSelectProfile(stage, event.target.value)}
          disabled={busy}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {UI_TEXT.settings.systemPrompt}
        <textarea
          value={data.settings.systemPrompt}
          rows={SYSTEM_PROMPT_ROWS}
          maxLength={CHAT_LIMITS.systemPrompt}
          disabled={busy}
          onChange={(event) =>
            onChange(stage, "systemPrompt", event.target.value)
          }
        />
      </label>
      <ParameterFields
        settings={data.settings}
        models={models}
        disabled={busy}
        onChange={changeParameter}
      />
      <button type="submit" disabled={busy}>
        {stage === CHAT_STAGE.translation
          ? UI_TEXT.settings.saveTranslation
          : title
            ? UI_TEXT.settings.saveGeneration
            : UI_TEXT.settings.save}
      </button>
    </form>
  );
}
