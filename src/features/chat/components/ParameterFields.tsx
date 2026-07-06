import type {
  ChatParameters,
  ChatSettings,
} from "../../../../shared/types/chat.ts";
import { CHAT_LIMITS } from "../../../../shared/constants/chat.ts";
import { UI_TEXT } from "../../../constants/ui.ts";

type Props = {
  settings: ChatSettings;
  models: string[];
  disabled: boolean;
  onChange: <K extends keyof ChatParameters>(
    key: K,
    value: ChatParameters[K],
  ) => void;
};

export function ParameterFields({
  settings,
  models,
  disabled,
  onChange,
}: Props) {
  const missingModel = !models.includes(settings.model);

  return (
    <>
      <label>
        {UI_TEXT.parameters.model}
        <select
          value={settings.model}
          onChange={(event) => onChange("model", event.target.value)}
          required
          disabled={disabled}
        >
          {missingModel && (
            <option value={settings.model} disabled>
              {settings.model}
              {UI_TEXT.parameters.missingModelSuffix}
            </option>
          )}
          {models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </label>
      <div className="parameter-grid">
        <label>
          {UI_TEXT.parameters.reasoning}
          <select
            value={settings.reasoningEffort}
            onChange={(event) =>
              onChange(
                "reasoningEffort",
                event.target.value as ChatSettings["reasoningEffort"],
              )
            }
            disabled={disabled}
          >
            {UI_TEXT.parameters.reasoningOptions.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <NumberField
          label={UI_TEXT.parameters.temperature}
          value={settings.temperature}
          limits={CHAT_LIMITS.temperature}
          disabled={disabled}
          onChange={(value) => onChange("temperature", value)}
        />
        <NumberField
          label={UI_TEXT.parameters.topP}
          value={settings.topP}
          limits={CHAT_LIMITS.topP}
          disabled={disabled}
          onChange={(value) => onChange("topP", value)}
        />
        <NumberField
          label={UI_TEXT.parameters.maxTokens}
          value={settings.maxTokens}
          limits={CHAT_LIMITS.maxTokens}
          disabled={disabled}
          onChange={(value) => onChange("maxTokens", value)}
        />
      </div>
    </>
  );
}

function NumberField({
  label,
  value,
  limits,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  limits: { min: number; max: number; step: number };
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        value={value}
        min={limits.min}
        max={limits.max}
        step={limits.step}
        disabled={disabled}
        onChange={(event) => onChange(event.target.valueAsNumber)}
        required
      />
    </label>
  );
}
