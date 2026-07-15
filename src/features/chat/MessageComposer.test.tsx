import { useState } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageComposer } from "./MessageComposer.tsx";
import type { ImageAttachment } from "../../../shared/types/chat.ts";

afterEach(cleanup);

describe("MessageComposer", () => {
  it("Enter는 전송하지 않고 버튼으로만 전송한다", () => {
    const onSend = vi.fn();

    function Harness() {
      const [draft, setDraft] = useState("");
      return (
        <MessageComposer
          draft={draft}
          attachments={[]}
          disabled={false}
          busy={false}
          onDraftChange={setDraft}
          onAttachmentsChange={() => undefined}
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

  it("이미지만 있어도 전송할 수 있다", () => {
    const onSend = vi.fn();
    const attachment: ImageAttachment = {
      id: "image-1",
      name: "test.png",
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,aGVsbG8=",
      size: 5,
    };

    const { getByRole } = render(
      <MessageComposer
        draft=""
        attachments={[attachment]}
        disabled={false}
        busy={false}
        onDraftChange={() => undefined}
        onAttachmentsChange={() => undefined}
        onSend={onSend}
        onStop={() => undefined}
      />,
    );

    fireEvent.click(getByRole("button", { name: "보내기" }));
    expect(onSend).toHaveBeenCalledOnce();
  });
});
