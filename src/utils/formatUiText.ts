import { UI_TEXT } from "../constants/ui.ts";

export const formatDeleteChatLabel = (title: string) => `${title} 삭제`;

export const formatSettingsTitle = (profileName?: string) =>
  profileName
    ? `${UI_TEXT.settings.title} · ${profileName}`
    : UI_TEXT.settings.title;

export const formatDeleteProfileConfirmation = (name: string) =>
  `“${name}” 프로필을 삭제할까요?`;

export const formatRequestFailedMessage = (status: number) =>
  `요청에 실패했습니다 (${status}).`;
