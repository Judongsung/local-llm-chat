import type { ChatSettings } from "../../shared/types/chat.ts";
import { REASONING_EFFORT } from "../../shared/constants/chat.ts";
import { SERVER_PATHS } from "../../shared/constants/server.ts";

export const UI_LOCALE = "ko-KR";

const UI_COMMON_TEXT = {
  closeChatList: "대화 목록 닫기",
  profileSettings: "프로필 설정",
  systemPrompt: "시스템 프롬프트",
  delete: "삭제",
} as const;

export const UI_TEXT = {
  app: {
    closeSidebar: UI_COMMON_TEXT.closeChatList,
    closeError: "닫기",
  },
  sidebar: {
    brand: "LLM Chat",
    newChat: "새 대화",
    translationBadge: "번역",
    close: UI_COMMON_TEXT.closeChatList,
    chatList: "대화 목록",
    deleteConfirm: "이 대화를 삭제할까요?",
    profileSettings: UI_COMMON_TEXT.profileSettings,
    gallery: "갤러리",
  },
  header: {
    openSidebar: "메뉴 열기",
    loadingChat: "대화를 불러오는 중",
  },
  settings: {
    title: "파라미터",
    generationTitle: "영문 생성 설정",
    translationTitle: "한글 번역 설정",
    fallback: "삭제된 프로필 대신 기본 프로필이 적용되었습니다.",
    profile: "프로필",
    systemPrompt: UI_COMMON_TEXT.systemPrompt,
    save: "채팅 설정 저장",
    saveGeneration: "영문 생성 설정 저장",
    saveTranslation: "한글 번역 설정 저장",
  },
  parameters: {
    model: "모델",
    missingModelSuffix: " (설정 없음)",
    reasoning: "추론 단계",
    temperature: "Temperature",
    topP: "Top P",
    maxTokens: "최대 토큰",
    reasoningOptions: [
      { value: REASONING_EFFORT.none, label: "사용 안 함" },
      { value: REASONING_EFFORT.low, label: "낮음" },
      { value: REASONING_EFFORT.medium, label: "보통" },
      { value: REASONING_EFFORT.high, label: "높음" },
    ] as const satisfies ReadonlyArray<{
      value: ChatSettings["reasoningEffort"];
      label: string;
    }>,
  },
  profileDialog: {
    title: UI_COMMON_TEXT.profileSettings,
    close: "프로필 설정 닫기",
    selectProfile: "편집할 프로필",
    defaultSuffix: " (기본)",
    profileName: "프로필 이름",
    systemPrompt: UI_COMMON_TEXT.systemPrompt,
    create: "새로 저장",
    update: "덮어쓰기",
    delete: UI_COMMON_TEXT.delete,
  },
  messages: {
    deleteConfirm: "이 프롬프트와 응답을 삭제할까요?",
    emptyTitle: "새 대화를 시작하세요.",
    emptyDescription: `API 키는 서버의 ${SERVER_PATHS.modelCatalog} 파일에서만 사용됩니다.`,
    user: "나",
    assistant: "AI",
    originalEnglish: "영문 원문",
    generatingEnglish: "영문 답변을 생성하고 있습니다.",
    translatingKorean: "한글로 번역하고 있습니다.",
    translationUnavailable: "번역이 완료되지 않았습니다.",
    retryTranslation: "번역 다시 시도",
    stopped: "중단됨",
    error: "오류",
    edit: "수정",
    delete: UI_COMMON_TEXT.delete,
    editPrompt: "프롬프트 수정",
    save: "저장",
    cancel: "취소",
    reasoning: "추론 과정",
  },
  composer: {
    placeholder: "메시지를 입력하세요.",
    message: "메시지",
    attachImage: "이미지",
    removeImage: "이미지 제거",
    imageRejected:
      "지원하지 않는 이미지이거나 압축 후에도 크기 제한을 초과했습니다.",
    stop: "중단",
    send: "보내기",
  },
  gallery: {
    title: "갤러리",
    loading: "갤러리를 불러오는 중입니다.",
    loadingMore: "더 불러오는 중",
    loadMore: "더 보기",
    retry: "다시 시도",
    empty: "이 폴더에는 지원하는 이미지나 영상이 없습니다.",
    breadcrumbs: "현재 폴더 경로",
    folders: "하위 폴더",
    media: "미디어",
    viewer: "미디어 전체 화면",
    viewerUnavailable: "열려던 미디어 정보를 찾을 수 없습니다.",
    backToGallery: "갤러리로 돌아가기",
    closeViewer: "전체 화면 닫기",
    rotateClockwise: "시계 방향으로 90도 회전",
    previous: "이전 미디어",
    next: "다음 미디어",
    videoFailed: "이 영상을 재생할 수 없습니다.",
    videoCompatibility: "H.264 MP4 또는 MOV 형식인지 확인해 주세요.",
  },
  chatTypeDialog: {
    title: "새 대화 유형",
    description: "사용할 채팅 프로세스를 선택하세요.",
    standard: "일반 채팅",
    standardDescription: "한 번의 모델 응답을 그대로 표시합니다.",
    translation: "영문 → 한글 채팅",
    translationDescription:
      "영문 답변을 생성한 뒤 별도 모델 설정으로 한글 번역합니다.",
    close: "새 대화 유형 선택 닫기",
  },
  errors: {
    generic: "오류가 발생했습니다.",
    streamBody: "스트림 응답을 읽을 수 없습니다.",
  },
} as const;

export const UI_TEXT_FORMATTERS = {
  deleteChatLabel: (title: string) => `${title} 삭제`,
  settingsTitle: (profileName?: string) =>
    profileName
      ? `${UI_TEXT.settings.title} · ${profileName}`
      : UI_TEXT.settings.title,
  deleteProfileConfirmation: (name: string) =>
    `“${name}” 프로필을 삭제할까요?`,
  requestFailed: (status: number) => `요청에 실패했습니다 (${status}).`,
} as const;
