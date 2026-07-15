import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ParameterFields } from "./ParameterFields.tsx";

afterEach(cleanup);

describe("ParameterFields", () => {
  it("설정된 모델만 선택하며 누락된 현재 모델도 표시한다", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ParameterFields
        settings={{
          model: "first-model",
          systemPrompt: "",
          temperature: 0.7,
          topP: 1,
          maxTokens: 256,
          reasoningEffort: "none",
        }}
        models={["first-model", "second-model"]}
        disabled={false}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("모델"), {
      target: { value: "second-model" },
    });
    expect(onChange).toHaveBeenCalledWith("model", "second-model");

    rerender(
      <ParameterFields
        settings={{
          model: "removed-model",
          systemPrompt: "",
          temperature: 0.7,
          topP: 1,
          maxTokens: 256,
          reasoningEffort: "none",
        }}
        models={["first-model"]}
        disabled={false}
        onChange={onChange}
      />,
    );
    expect(
      (screen.getByRole("option", { name: /설정 없음/ }) as HTMLOptionElement)
        .disabled,
    ).toBe(true);
  });
});
