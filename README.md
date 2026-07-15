# Local LLM Chat

OpenAI 호환 API를 로컬 서버에서 호출하는 단일 사용자용 채팅
애플리케이션입니다. API 키와 채팅 데이터는 브라우저가 아닌 로컬
파일에만 저장됩니다.

## 주요 기능

- 여러 API URL과 모델을 등록하고 채팅·프로필별로 선택
- 파라미터 프로필과 채팅별 오버라이드 저장
- 영문 답변 생성 후 별도 이력·설정으로 한글 번역하는 2단계 채팅
- 채팅방별 JSON 파일 저장
- 스트리밍 응답과 중단 처리
- 이미지 첨부 전송 및 채팅 파일 내 보존
- PC 폴더의 이미지·영상을 모바일에서 보는 읽기 전용 갤러리
- Markdown, 코드 블록, KaTeX 수식 렌더링
- 추론 내용 별도 저장 및 접이식 UI 표시
- PC와 모바일 레이아웃 지원

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| 런타임 | Node.js 24 이상, TypeScript 5.9 |
| 프론트엔드 | React 19, React DOM 19 |
| 서버 | Express 5 |
| 개발·빌드 | Vite 7 |
| Markdown·수식 | react-markdown 10, remark-math 6, rehype-katex 7, KaTeX 0.17 |
| 테스트 | Node.js Test Runner, Vitest 3, Testing Library 16, jsdom 27 |

## 설치 및 설정

```powershell
npm install
Copy-Item .env.example .env
Copy-Item llm-models.example.json llm-models.json
```

`llm-models.json`에 사용할 모델을 등록합니다.

```json
[
  {
    "apiKey": "your-api-key",
    "baseUrl": "https://api.openai.com/v1",
    "model": "gpt-4.1-mini"
  }
]
```

- `model` 값은 배열 안에서 중복될 수 없습니다.
- 첫 번째 항목이 새 프로필의 기본 모델입니다.
- 파일 변경은 서버를 다시 시작한 뒤 반영됩니다.
- `llm-models.json`은 Git에서 제외되며 브라우저로 전달되지 않습니다.

`.env`에서는 서버 주소, 포트와 선택적인 갤러리 폴더를 설정합니다.

```dotenv
HOST=0.0.0.0
PORT=3000
GALLERY_ROOT=C:\Media
```

PC에서만 접속하려면 `HOST=127.0.0.1`로 제한할 수 있습니다.
`GALLERY_ROOT`를 생략하면 기존 채팅 기능만 표시됩니다. 값이 있으면
존재하는 절대 폴더 경로여야 하며, 공백이 있는 경로는 따옴표로
감쌉니다(예: `GALLERY_ROOT="D:\My Media"`).

## 실행

개발 서버:

```powershell
npm run dev
```

PC에서는 `http://127.0.0.1:3000`을 사용합니다. 같은 내부망의 모바일
기기에서는 PC의 IPv4 주소와 포트로 접속합니다.

## 갤러리

사이드 메뉴의 **갤러리**에서 `GALLERY_ROOT` 아래 폴더를 탐색할 수
있습니다. 이미지에는 모바일용 WebP 썸네일을 사용하고, 원본 이미지와
영상은 항목을 열었을 때만 전송합니다. 영상은 Range 스트리밍을 사용해
iPhone Safari에서 필요한 부분부터 재생합니다.

- 이미지: JPEG, PNG, WebP, GIF
- 영상: MP4, MOV, M4V (H.264 등 Safari가 지원하는 코덱 필요)
- dot 파일·폴더와 심볼릭 링크는 표시하지 않습니다.
- 갤러리는 보기 전용이며 업로드·다운로드 버튼·삭제를 제공하지 않습니다.

이 앱에는 사용자 인증이 없으므로 신뢰할 수 있는 집 내부망에서만
사용하고 인터넷에 포트를 직접 공개하지 마세요.

프로덕션:

```powershell
npm run build
npm start
```

## 데이터 저장

- `data/profiles.json`: 전역 파라미터 프로필
- `data/chats/<채팅 ID>.json`: 채팅 유형과 단계별 메시지, 프로필 ID, 오버라이드
- `llm-models.json`: 서버 전용 API 키, API URL, 모델 목록

채팅 파일은 프로필 기본값과 다른 시스템 프롬프트 및 파라미터만
단계별 오버라이드로 저장합니다. 번역 채팅은 영문 생성 이력과 한글
번역 이력을 한 파일의 별도 단계로 보존하며, 기존 버전 1 채팅 파일은
시작할 때 일반 채팅 형식으로 자동 마이그레이션됩니다.
추론 내용은 채팅 파일에 보존되지만 후속 모델 요청 이력에는 포함하지
않습니다.

이미지 첨부는 전송 전에 긴 변 기준 1024px 이하의 JPEG로 압축한 뒤
채팅 JSON에 Data URL로 저장됩니다. PNG, JPEG, WebP 원본을 메시지당
최대 4개, 파일당 최대 5MiB까지 선택할 수 있으며, 압축 후 이미지는
개당 768KiB 이하여야 합니다. 선택한 모델과 API 엔드포인트가 이미지
입력을 지원해야 실제 이미지 해석이 동작합니다.

## 검증

```powershell
npm test
npm run build
```
