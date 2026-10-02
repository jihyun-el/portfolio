# 우지현 포트폴리오

[Chanh Dai](https://github.com/ncdai/chanhdai.com)의 선·타이포그래피·다크 모드 구성을 바탕으로 만든 정적 포트폴리오다. 원본 앱의 코드는 이 저장소에 두지 않는다.

현재 소개·카드·상세 글은 **근거를 바탕으로 준비한 1차 초안**이다. 공개 저장소는 [jihyun-el/portfolio](https://github.com/jihyun-el/portfolio), Pages 주소는 [jihyun-el.github.io/portfolio](https://jihyun-el.github.io/portfolio/)다. 개인 연락처·프로필 사진은 미정이라 표시하지 않았다.

첫 제출 버전은 `gh-pages`에 정적 결과물을 올려 공개했다. 이후 GitHub Actions의 성공 실행 이력을 확인하고 Pages Source를 **GitHub Actions**로 전환했다. `main`의 내용 수정은 같은 URL에 자동 배포한다. 생성된 HTML은 직접 편집하지 않는다.

## 수정할 파일

대표 프로젝트는 **클래식메이트 + VQA 두 개**다. 클래식메이트의 앱·파이프라인·엔진은 JSON의 `parts`와 `content/projects/classicmate-<part id>.md`에서 편집하며 한 상세 페이지의 각 절로 표시된다. 세 저장소를 별개 프로젝트 카드로 늘리지 않는다. 글꼴은 로컬 Pretendard Variable 하나를 쓴다.

| 바꾸려는 것 | 파일 |
|---|---|
| 이름·소개·경험·공개 링크 | `content/profile.json` |
| 기술 스택: 뿌리 언어(Python·Dart)와 기술마다 거친 언어·사용 설명·프로젝트 연결 | `content/stack.json` |
| 월별 개발 활동·실제 커밋 이력 | `content/history.json` |
| 엔진 성능·VQA 실험과 점수 그래프 | `content/metrics.json` |
| 프로젝트 카드·순서·접힘 초기 상태 | `content/projects.json` |
| 홈 프로젝트의 파트별 문제·접근·근거 수치·검증 범위 | `content/cases.json` |
| 엔진 입출력 계약 도식 | `content/contracts.json` |
| 프로젝트 상세 글 | `content/projects/<프로젝트 id>.md` |
| 개발 기록 추가 | `content/writing/<영문-slug>.md` — 첫 줄은 `# 글 제목` |
| 이미지·음원·공개 PDF | `public/` — Markdown에서 `/파일명`으로 참조 |
| 색·여백·모바일 스타일 | `src/app/globals.css` |
| 홈 배치 | `src/app/page.tsx` |
| 신호 흐름 파노라마의 예시 입력 | `src/lib/example-input.ts` |
| 자동 배포 | `.github/workflows/github-pages.yml` |

상세 글·기록은 일반 Markdown이다. JSX나 서버 코드를 글에 넣을 필요가 없다. 새 프로젝트를 추가할 때는 JSON 항목과 같은 id의 `.md` 파일을 함께 만든다. 새 기록 파일은 빌드할 때 자동으로 목록과 상세 페이지에 추가된다. 초안 메모는 `content/` 밖에 둔다. `content/` 안의 모든 글은 빌드 대상이다.

`content/profile.json`의 `links`에는 예를 들어 `{"label":"GitHub","url":"https://github.com/본인계정"}`을 넣는다. 이름·URL이 확인된 공개 연락처만 추가한다. 작성·갱신 날짜는 화면에 표시하지 않는다.

## 로컬 편집과 미리보기

Node.js 24를 사용한다. 명령은 저장소 루트에서 실행한다.

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run dev
```

개발 서버가 표시하는 로컬 주소에서 수정 결과를 확인한다. 배포할 정적 파일은 다음으로 검사한다.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run check-types
npm.cmd run preview
```

정적 미리보기 주소는 `http://127.0.0.1:4173/`이다. 결과물은 `out/`에 생긴다. 생성된 HTML을 직접 고치지 않는다.

일반 저장소 주소처럼 `/portfolio/` 하위에서 동작하는지도 확인할 수 있다.

```powershell
$env:PAGES_BASE_PATH = '/portfolio'
$env:PAGES_SITE_URL = 'https://본인계정.github.io/portfolio'
npm.cmd run build
npm.cmd run preview
```

이때 미리보기는 `http://127.0.0.1:4173/portfolio/`다. 루트 주소로 돌아가려면 두 환경 변수를 비우고 다시 빌드한다.

## 배포 설정

1. GitHub 저장소 **Settings → Pages → Build and deployment → Source**는 **GitHub Actions**다.
2. 기본 브랜치는 `main`이다. 새 작업은 브랜치에서 하고 검증한 뒤 `main`에 반영한다. `main` push가 곧 공개 사이트 재배포다.
3. 수동 재배포는 **Actions → Portfolio GitHub Pages → Run workflow**로 한다.

주소는 `<계정>.github.io` 이름의 저장소면 루트 주소, 다른 이름이면 `/<저장소명>/` 주소다. workflow가 Pages 설정에서 `base_path`와 실제 URL을 읽으므로 저장소 이름을 코드에 고정할 필요가 없다. GitHub Pages에 사용자 도메인을 설정한 경우에도 그 설정을 읽는다.

## 공개 후 계속 고치기

**파일 편집 → commit → push → 자동 검증·빌드 → 재배포.** GitHub 웹에서 JSON·Markdown을 편집하고 commit해도 같은 배포 흐름이 실행된다. PR은 정적 빌드·타입 검사만 하며 공개 사이트를 바꾸지 않는다. `main` 반영 후 배포한다. 이전 상태로 돌아가려면 해당 소스 커밋을 revert해 다시 push한다.

`history.json`은 실제 프로젝트 브랜치에서 확인한 작성자 `manu`의 월별 커밋과 선정한 변경 이력이다. 병합·문서·AI 공동작성을 포함하므로 직접 작성 비율이나 전체 팀 기여 비율로 바꾸지 않는다. 엔진의 8월 커밋은 코드 대조 문서 정리다. 새 이력을 넣을 때는 실제 SHA·날짜·집계 범위를 먼저 확인한다.

`metrics.json` 수치는 기록에서 확인한 조건과 함께 수정한다. 실기기 계산 시간은 입력→출력 전체 지연과 구분하고, VQA는 Public 점수로 표시한다. 네 실험 조건·0~1 점수 범위·월별 커밋 합계와 프로젝트 연결은 빌드 전에 검사한다. 비교 버튼과 도식은 `src/components/interactive-figures.tsx`, `project-figures.tsx`에서 관리한다.

신호 흐름 파노라마(`src/components/signal-chain-3d.tsx`)는 지어낸 예시 연주를 재생한다. 화면이 읽는 엔진 결과는 `src/lib/example-run.json`에 미리 계산해 둔 생성 데이터이며 직접 편집하지 않는다. three.js는 섹션이 화면 근처에 올 때만 불러온다.

글이 늘어도 레이아웃 파일을 매번 수정하지 않는다. 내용은 `content/`, 화면은 `src/`, 정적 자산은 `public/`에서 관리한다. 관리자 로그인·DB 없이도 공개 후 계속 편집할 수 있는 구조다.

## 빌드 범위와 출처

현재 배포 앱은 [Next.js 정적 내보내기](https://nextjs.org/docs/app/guides/static-exports)를 사용하고, `out/`만 [GitHub Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)에 전달한다. API·원본 컴포넌트 레지스트리·원작자의 추천사/후원/개인 프로필은 배포 앱에 포함하지 않았다. 내부 역량 보고서·비공개 저장소·운영 데이터는 빌드 입력이 아니다.

Chanh Dai의 MIT 고지는 `LICENSE`에 유지하고, 같은 고지를 `public/LICENSE`로 공개 사이트에도 싣는다. Pretendard 글꼴의 OFL 고지는 `public/fonts/Pretendard-LICENSE.txt`에 있다.
