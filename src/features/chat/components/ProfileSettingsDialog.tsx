import { useEffect, useRef, useState, type FormEvent } from "react";
import type {
  ChatParameters,
  ChatSettings,
  ParameterProfile,
  ProfileCatalog,
} from "../../../../shared/types/chat.ts";
import { CHAT_LIMITS } from "../../../../shared/constants/chat.ts";
import { UI_SYMBOLS, UI_TEXT } from "../../../constants/ui.ts";
import { formatDeleteProfileConfirmation } from "../../../utils/formatUiText.ts";
import { ParameterFields } from "./ParameterFields.tsx";

type Props = {
  catalog: ProfileCatalog;
  models: string[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onCreate: (
    name: string,
    settings: ChatSettings,
  ) => Promise<ParameterProfile | null>;
  onUpdate: (
    id: string,
    name: string,
    settings: ChatSettings,
  ) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
};

export function ProfileSettingsDialog({
  catalog,
  models,
  busy,
  error,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [selectedId, setSelectedId] = useState(catalog.defaultProfileId);
  const [draft, setDraft] = useState(() => selectedProfile(catalog));

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    const profile =
      catalog.profiles.find((item) => item.id === selectedId) ??
      selectedProfile(catalog);
    setSelectedId(profile.id);
    setDraft(profile);
  }, [catalog, selectedId]);

  function changeProfile(id: string) {
    const profile = catalog.profiles.find((item) => item.id === id);
    if (profile) {
      setSelectedId(id);
      setDraft(profile);
    }
  }

  function changeSetting<K extends keyof ChatSettings>(
    key: K,
    value: ChatSettings[K],
  ) {
    setDraft((current) => ({
      ...current,
      settings: { ...current.settings, [key]: value },
    }));
  }

  function changeParameter<K extends keyof ChatParameters>(
    key: K,
    value: ChatParameters[K],
  ) {
    setDraft((current) => ({
      ...current,
      settings: { ...current.settings, [key]: value },
    }));
  }

  async function create() {
    const created = await onCreate(draft.name, draft.settings);
    if (created) {
      setSelectedId(created.id);
      setDraft(created);
    }
  }

  async function update(event: FormEvent) {
    event.preventDefault();
    await onUpdate(selectedId, draft.name, draft.settings);
  }

  async function remove() {
    if (
      window.confirm(formatDeleteProfileConfirmation(draft.name)) &&
      (await onDelete(selectedId))
    ) {
      setSelectedId(catalog.defaultProfileId);
    }
  }

  return (
    <dialog
      className="profile-dialog"
      ref={dialogRef}
      onClose={onClose}
    >
      <form onSubmit={update}>
        <header>
          <h2>{UI_TEXT.profileDialog.title}</h2>
          <button
            type="button"
            className="dialog-close"
            onClick={() => dialogRef.current?.close()}
            aria-label={UI_TEXT.profileDialog.close}
          >
            {UI_SYMBOLS.close}
          </button>
        </header>
        <label>
          {UI_TEXT.profileDialog.selectProfile}
          <select
            value={selectedId}
            onChange={(event) => changeProfile(event.target.value)}
            disabled={busy}
          >
            {catalog.profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
                {profile.id === catalog.defaultProfileId
                  ? UI_TEXT.profileDialog.defaultSuffix
                  : ""}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="profile-warning" role="alert">
            {error}
          </p>
        )}
        <label>
          {UI_TEXT.profileDialog.profileName}
          <input
            value={draft.name}
            maxLength={CHAT_LIMITS.profileName}
            required
            disabled={busy}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
          />
        </label>
        <label>
          {UI_TEXT.profileDialog.systemPrompt}
          <textarea
            value={draft.settings.systemPrompt}
            maxLength={CHAT_LIMITS.systemPrompt}
            rows={6}
            disabled={busy}
            onChange={(event) =>
              changeSetting("systemPrompt", event.target.value)
            }
          />
        </label>
        <ParameterFields
          settings={draft.settings}
          models={models}
          disabled={busy}
          onChange={changeParameter}
        />
        <div className="profile-dialog-actions">
          <button type="button" disabled={busy} onClick={() => void create()}>
            {UI_TEXT.profileDialog.create}
          </button>
          <button type="submit" disabled={busy}>
            {UI_TEXT.profileDialog.update}
          </button>
          <button
            type="button"
            className="danger-button"
            disabled={busy || catalog.profiles.length === 1}
            onClick={() => void remove()}
          >
            {UI_TEXT.profileDialog.delete}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function selectedProfile(catalog: ProfileCatalog) {
  return (
    catalog.profiles.find(
      (profile) => profile.id === catalog.defaultProfileId,
    ) ?? catalog.profiles[0]
  );
}
