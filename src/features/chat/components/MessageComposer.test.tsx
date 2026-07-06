import { useState } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageComposer } from "./MessageComposer.tsx";

afterEach(cleanup);

describe("MessageComposer", () => {
  it("Enter는 전송하지 않고 버튼으로만 전송한다", () => {
    const onSend = vi.fn();

    function Harness() {
      const [draft, setDraft] = useState("");
      return (
        <MessageComposer
          draft={draft}
          disabled={false}
          busy={false}
          onDraftChange={setDraft}
          onSend={onSend}
          onStop={() => undefined}
        />
      );
    }

    const { getByLabelText, getByRole } = render(<Harness />);
    const textarea = getByLabelText("메시지");
    fireEvent.change(textarea, { target: { value: "첫 줄\n둘째 줄" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSend).not.toHaveBeenCalled();
    expect((textarea as HTMLTextAreaElement).value).toBe("첫 줄\n둘째 줄");

    fireEvent.click(getByRole("button", { name: "보내기" }));
    expect(onSend).toHaveBeenCalledOnce();
  });
});
