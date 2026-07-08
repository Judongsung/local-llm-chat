export const SERVER_PATHS = {
  modelCatalog: "llm-models.json",
  dataDirectory: "data",
} as const;

export const SERVER_ENVIRONMENT_KEYS = {
  host: "HOST",
  port: "PORT",
} as const;

export const SERVER_NETWORK_DEFAULTS = {
  host: "0.0.0.0",
  port: 3000,
  portRange: { min: 1, max: 65_535 },
} as const;

export const SERVER_LIMITS = {
  jsonBody: "6mb",
} as const;

export const SERVER_EXPRESS_SETTINGS = {
  poweredBy: "x-powered-by",
} as const;

export const SERVER_STATIC_OPTIONS = {
  dotfiles: "deny",
  index: false,
} as const;

export const SERVER_ERROR_MESSAGES = {
  unknownApiPath: "API 경로를 찾을 수 없습니다.",
  internalServer: "서버 오류가 발생했습니다.",
  invalidJson: "요청 본문이 올바른 JSON이 아닙니다.",
  requestTooLarge: "요청 본문이 너무 큽니다.",
  invalidProfileStore: "프로필 저장 파일 형식이 올바르지 않습니다.",
  invalidProfileStoreValues: "프로필 저장 파일에 중복되거나 잘못된 값이 있습니다.",
  invalidChatFile: "채팅 저장 파일 형식이 올바르지 않습니다.",
  invalidProfile: "프로필 이름이나 파라미터 값이 올바르지 않습니다.",
  invalidProfileId: "프로필 ID가 올바르지 않습니다.",
  invalidId: "ID 형식이 올바르지 않습니다.",
  invalidParameters: "파라미터 값이 올바르지 않습니다.",
  invalidMessage: "메시지나 이미지 첨부가 올바르지 않습니다.",
  chatNotFound: "대화를 찾을 수 없습니다.",
  profileNotFound: "프로필을 찾을 수 없습니다.",
  messageNotFound: "메시지를 찾을 수 없습니다.",
  lastProfile: "마지막 프로필은 삭제할 수 없습니다.",
  duplicateProfileName: "같은 이름의 프로필이 이미 있습니다.",
  busy: "이미 응답을 생성하고 있습니다.",
  busyProfile: "응답 생성 중에는 프로필을 변경할 수 없습니다.",
  busySettings: "응답 생성 중에는 설정을 변경할 수 없습니다.",
  busyDelete: "응답 생성 중에는 삭제할 수 없습니다.",
  busyEdit: "응답 생성 중에는 수정할 수 없습니다.",
  emptyLlmResponse: "LLM API가 빈 응답을 반환했습니다.",
  chatDeleted: "대화가 삭제되었습니다.",
  stopped: "응답 생성을 중단했습니다.",
  llmRequestFailed: "LLM 요청에 실패했습니다.",
  missingModelConfig: "선택한 모델 설정을 찾을 수 없습니다.",
  missingResponseBody: "LLM API 응답 본문이 없습니다.",
  invalidStream: "LLM API 스트림 형식이 올바르지 않습니다.",
} as const;
