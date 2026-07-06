import type { ChatSettings } from "../../shared/types/chat.ts";

export const UI_LOCALE = "ko-KR";

export const UI_SYMBOLS = {
  close: "×",
  menu: "☰",
} as const;

export const UI_TEXT = {
  app: {
    closeSidebar: "대화 목록 닫기",
    closeError: "닫기",
  },
  sidebar: {
    brand: "LLM Chat",
    newChat: "새 대화",
    close: "대화 목록 닫기",
    chatList: "대화 목록",
    deleteConfirm: "이 대화를 삭제할까요?",
    profileSettings: "프로필 설정",
  },
  header: {
    openSidebar: "대화 목록 열기",
    loadingChat: "대화를 불러오는 중",
  },
  settings: {
    title: "파라미터",
    fallback: "삭제된 프로필 대신 기본 프로필이 적용되었습니다.",
    profile: "프로필",
    systemPrompt: "시스템 프롬프트",
    save: "채팅 설정 저장",
  },
  parameters: {
    model: "모델",
    missingModelSuffix: " (설정 없음)",
    reasoning: "추론 단계",
    temperature: "Temperature",
    topP: "Top P",
    maxTokens: "최대 토큰",
    reasoningOptions: [
      { value: "none", label: "사용 안 함" },
      { value: "low", label: "낮음" },
      { value: "medium", label: "보통" },
      { value: "high", label: "높음" },
    ] as const satisfies ReadonlyArray<{
      value: ChatSettings["reasoningEffort"];
      label: string;
    }>,
  },
  profileDialog: {
    title: "프로필 설정",
    close: "프로필 설정 닫기",
    selectProfile: "편집할 프로필",
    defaultSuffix: " (기본)",
    profileName: "프로필 이름",
    systemPrompt: "시스템 프롬프트",
    create: "새로 저장",
    update: "덮어쓰기",
    delete: "삭제",
  },
  messages: {
    deleteConfirm: "이 프롬프트와 응답을 삭제할까요?",
    emptyTitle: "새 대화를 시작하세요.",
    emptyDescription:
      "API 키는 서버의 llm-models.json 파일에서만 사용됩니다.",
    user: "나",
    assistant: "AI",
    stopped: "중단됨",
    error: "오류",
    edit: "수정",
    delete: "삭제",
    editPrompt: "프롬프트 수정",
    save: "저장",
    cancel: "취소",
    reasoning: "추론 과정",
  },
  composer: {
    placeholder: "메시지를 입력하세요.",
    message: "메시지",
    stop: "중단",
    send: "보내기",
  },
  errors: {
    generic: "오류가 발생했습니다.",
    streamBody: "스트림 응답을 읽을 수 없습니다.",
  },
} as const;
