# 우지현 포트폴리오

ClassicMate와 멀티모달 VQA 두 프로젝트를 담은 정적 포트폴리오다. Next.js 정적 내보내기로 만들고 GitHub Pages로 배포한다.

공개 저장소는 [jihyun-el/portfolio](https://github.com/jihyun-el/portfolio), Pages 주소는 [jihyun-el.github.io/portfolio](https://jihyun-el.github.io/portfolio/)다. 이 주소는 제출한 지원서에 들어 있으므로 아래 경로는 바꾸거나 지우지 않는다. 바꿔야 하면 옛 주소에서 새 주소로 넘어가게 한다.

- `/`, `/projects/classicmate/`, `/projects/ssafy-ai-challenge/`
- `/writing/`, `/writing/<글 slug>/`

`main`에 push하면 같은 주소로 자동 배포된다. `gh-pages` 브랜치는 첫 제출 때 올린 정적 결과물이라 지우지 않는다. 생성된 HTML은 직접 편집하지 않는다.

## 수정할 파일

대표 프로젝트는 **ClassicMate + VQA 두 개**다. ClassicMate의 앱·파이프라인·엔진은 JSON의 `parts`와 `content/projects/classicmate-<part id>.md`에서 편집하며 한 상세 페이지의 각 절로 표시된다. 세 저장소를 별개 프로젝트 카드로 늘리지 않는다. 글꼴은 로컬 Pretendard Variable 하나를 쓴다.

| 바꾸려는 것 | 파일 |
|---|---|
| 이름·소개·경험·공개 링크 | `content/profile.json` |
| 기술 스택: 언어(Python·Dart)와 기술마다 거친 언어·사용 설명·프로젝트 연결. 묶음의 `tier`가 크기를 정함 — `main`은 큰 칸, `sub`는 작은 목록, `tool`은 이름만 한 줄 | `content/stack.json` |
| 월별 개발 활동·실제 커밋 이력 | `content/history.json` |
| 엔진 성능·VQA 실험과 점수 그래프 | `content/metrics.json` |
| 프로젝트 카드·순서·접힘 초기 상태 | `content/projects.json` |
| 카드의 스택 줄(`stack`, 없으면 `stack.json`에서 모음)·제일 어려웠던 것(`hardest`)·연결할 트러블슈팅 글(`troubles`)·결과 숫자(`results`)·홈에서 한 일을 라벨 한 줄로 접어 둘지(`fold`) | `content/cases.json` |
| 엔진 입출력 계약 도식 | `content/contracts.json` |
| 카드의 개요·한 일·결과 | `content/projects/classicmate-<part id>.md`, `content/projects/ssafy-ai-challenge.md` — 첫 문단은 개요 한 줄, 그 뒤 `## 라벨`마다 한 일 하나. 라벨 아래 첫 문단은 카드에 보이는 한 줄(숫자는 `**굵게**`), 나머지는 눌렀을 때 펼쳐지는 상세. `## 결과`는 결과 칸으로 감. 도식은 `<!-- figure:이름 -->`, 식은 `$$…$$`(문장 안에서는 `$…$`) |
| ClassicMate 전체 개요 글 | `content/projects/classicmate.md` |
| 트러블슈팅 글 추가 | `content/writing/<영문-slug>.md` — 첫 줄은 `# 글 제목`, 첫 문단은 홈 카드에 실리는 한 문장 요약. 목록은 파일 이름순. 둘째 줄에 `<!-- home: hidden -->`을 두면 홈 목록에서만 빠지고 글 주소는 남음 |
| 이미지·음원·공개 PDF | `public/` — Markdown에서 `/파일명`으로 참조 |
| 색·여백·모바일 스타일 | `src/app/globals.css` |
| 홈 배치 | `src/app/page.tsx` |
| 신호 흐름 파노라마의 예시 입력 | `src/lib/example-input.ts` |
| 자동 배포 | `.github/workflows/github-pages.yml` |

상세 글·기록은 일반 Markdown이다. JSX나 서버 코드를 글에 넣을 필요가 없다. 새 프로젝트를 추가할 때는 JSON 항목과 같은 id의 `.md` 파일을 함께 만든다. 새 기록 파일은 빌드할 때 자동으로 목록과 상세 페이지에 추가된다. 초안 메모는 `content/` 밖에 둔다. `content/` 안의 모든 글은 빌드 대상이다.

`content/profile.json`의 `links`에는 `{"label":"GitHub","url":"https://github.com/jihyun-el"}` 같은 형식으로 넣는다. 이름·URL이 확인된 공개 연락처만 추가한다. 작성·갱신 날짜는 화면에 표시하지 않는다.

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

배포 전에는 실제 주소처럼 `/portfolio/` 하위에서 동작하는지 확인한다.

```powershell
$env:PAGES_BASE_PATH = '/portfolio'
$env:PAGES_SITE_URL = 'https://jihyun-el.github.io/portfolio'
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

`history.json`은 실제 프로젝트 저장소에서 확인한 작성자 `manu`의 월별 커밋과 선정한 변경 이력이다. main에 없는 커밋이 다른 브랜치에 있으면 `branches`에 브랜치마다 끝 커밋과 더해지는 커밋 수를 적고, main과 내용이 같은 커밋(`git cherry`의 `-`)은 세지 않는다. 병합·문서·AI 공동작성을 포함하므로 직접 작성 비율이나 전체 팀 기여 비율로 바꾸지 않는다. 엔진의 8월 커밋은 코드 대조 문서 정리다. 새 이력을 넣을 때는 실제 SHA·날짜·집계 범위를 먼저 확인한다.

`metrics.json` 수치는 기록에서 확인한 조건과 함께 수정한다. 실기기 계산 시간은 입력→출력 전체 지연과 구분하고, VQA 점수 그래프는 Public 기록이고, 순위·최종 Private 점수는 `leaderboard`에 Public과 Private(서울·전체)을 구분해 둔다. 네 실험 조건·0~1 점수 범위·월별 커밋 합계와 프로젝트 연결은 빌드 전에 검사한다. 비교 버튼과 도식은 `src/components/interactive-figures.tsx`, `project-figures.tsx`에서 관리한다.

홈의 프로젝트는 단위마다 같은 칸의 카드(`src/components/unit-card.tsx`)다: 스택, 개요, 제일 어려웠던 것, 한 일, 트러블슈팅, 결과. 한 일의 줄을 누르면 그 줄 밑에 상세가 펼쳐진다. 트러블슈팅 글과 프로젝트 링크는 페이지를 옮기지 않고 오른쪽 서랍(`src/components/drawer.tsx`)에 열린다. 서랍과 상세 페이지(`/projects/…`)는 같은 카드를 모두 펼친 채로 쓰므로 내용은 한 곳만 고친다. 개선된 수치(이전 → 이후)는 `src/components/gain.tsx`가 강조 색으로 그린다. 사이트의 유일한 색은 개선에만 쓴다.

신호 흐름 파노라마(`src/components/signal-chain-3d.tsx`)는 홈의 반주 엔진 카드 안에서 눌러야 재생되며, 지어낸 예시 연주를 재생한다. 화면이 읽는 엔진 결과는 `src/lib/example-run.json`에 미리 계산해 둔 생성 데이터이며 직접 편집하지 않는다. three.js는 재생 버튼을 눌렀을 때만 불러온다.

글이 늘어도 레이아웃 파일을 매번 수정하지 않는다. 내용은 `content/`, 화면은 `src/`, 정적 자산은 `public/`에서 관리한다. 관리자 로그인·DB 없이도 공개 후 계속 편집할 수 있는 구조다.

## 빌드 범위와 라이선스

배포 앱은 [Next.js 정적 내보내기](https://nextjs.org/docs/app/guides/static-exports)를 사용하고, `out/`만 [GitHub Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)에 전달한다. 내부 역량 보고서·비공개 저장소·운영 데이터는 빌드 입력이 아니다.

`src/app/globals.css`의 도식 스타일 일부는 MIT 라이선스 코드를 고쳐 쓴 것이다. 그 원 고지를 `LICENSE`와 `public/LICENSE`에 두며, 해당 스타일이 남아 있는 동안 지우지 않는다. Pretendard 글꼴의 OFL 고지는 `public/fonts/Pretendard-LICENSE.txt`에 있다. 식은 빌드할 때 KaTeX(MIT)로 조판하며, KaTeX 글꼴(OFL)이 `out/`에 함께 들어간다. 기술 스택의 단색 로고(`src/lib/brand-icons.json`)는 세 가지 출처다. 문자열로 적힌 것은 Simple Icons 16.34.0(CC0)의 SVG 경로다. `huggingface`는 Hugging Face가 배포하는 공식 로고 SVG를 선 그림으로 다시 칠한 것이다(얼굴을 검게 채우지 않음). `riverpod`는 Riverpod 저장소(MIT)의 `website/static/img/logo.svg`, `librosa`는 librosa 저장소(ISC)의 `docs/img/librosa_logo_dark.svg`에서 글자를 뺀 표식을 한 색으로 그린 것이다. `verovio`와 `music21`은 공식 벡터 로고가 없어 이 사이트용으로 그린 음표 그림이며 공식 로고가 아니다. 각 상표는 해당 소유자의 것이다. 로고를 추가할 때는 경로를 넣고 `content/stack.json` 항목의 `icon`에 이름을 적는다.
