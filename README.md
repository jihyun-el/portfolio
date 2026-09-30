# 우지현 포트폴리오 — GitHub Pages 앱

Chanh Dai의 패널 컴포넌트와 프로젝트 행 구성, 선·타이포그래피·다크 모드를 가져온 정적 포트폴리오다. 원본 패널 구현은 `src/components/panel.tsx`에 복사했으며 CSS는 정적 앱에 맞게 적용했다. 원본 전체 코드는 상위 `src/`에 보존돼 있다.

현재 소개·카드·상세 글은 **근거를 바탕으로 준비한 1차 초안**이다. 공개 저장소는 [jihyun-el/portfolio](https://github.com/jihyun-el/portfolio), Pages 주소는 [jihyun-el.github.io/portfolio](https://jihyun-el.github.io/portfolio/)다. 개인 연락처·프로필 사진은 미정이라 표시하지 않았다.

## 수정할 파일

대표 프로젝트는 **클래식메이트 + VQA 두 개**다. 클래식메이트의 앱·파이프라인·엔진은 JSON의 `parts`와 `content/projects/classicmate-<part id>.md`에서 편집하며 한 상세 페이지의 각 절로 표시된다. 세 저장소를 별개 프로젝트 카드로 늘리지 않는다. 본문/한글은 로컬 Pretendard Variable, 헤딩의 Latin은 Geist를 사용한다.

| 바꾸려는 것 | 파일 |
|---|---|
| 이름·소개·기술·경험·공개 링크 | `content/profile.json` |
| 프로젝트 카드·순서·접힘 초기 상태 | `content/projects.json` |
| 프로젝트 상세 글 | `content/projects/<프로젝트 id>.md` |
| 개발 기록 추가 | `content/writing/<영문-slug>.md` — 첫 줄은 `# 글 제목` |
| 이미지·음원·공개 PDF | `public/` — Markdown에서 `/파일명`으로 참조 |
| 색·여백·모바일 스타일 | `src/app/globals.css` |
| 홈 배치 | `src/app/page.tsx` |
| 자동 배포 | 상위 `.github/workflows/github-pages.yml` |

상세 글·기록은 일반 Markdown이다. JSX나 서버 코드를 글에 넣을 필요가 없다. 새 프로젝트를 추가할 때는 JSON 항목과 같은 id의 `.md` 파일을 함께 만든다. 새 기록 파일은 빌드할 때 자동으로 목록과 상세 페이지에 추가된다. 초안 메모는 `content/` 밖에 둔다. `content/` 안의 모든 글은 빌드 대상이다.

`content/profile.json`의 `links`에는 예를 들어 `{"label":"GitHub","url":"https://github.com/본인계정"}`을 넣는다. 이름·URL이 확인된 공개 연락처만 추가한다. 작성·갱신 날짜는 화면에 표시하지 않는다.

## 로컬 편집과 미리보기

Node.js 24를 사용한다. 명령은 **이 `pages-site/` 폴더에서** 실행한다.

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

## 첫 공개 준비

1. **이 앱의 상위 저장소만** 본인 GitHub의 포트폴리오 저장소에 올린다. `pesonal_docs` 아카이브는 별도다. 원본 remote는 `upstream`, 본인 공개 저장소는 `origin`이다.
2. 공개 저장소의 기본 브랜치는 `main`이다. 새 작업은 `codex/` 브랜치에서 진행하고 검증 후 `main`에 반영할 수 있다.
3. GitHub 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정한다.
4. **Actions → Portfolio GitHub Pages → Run workflow**로 첫 빌드를 실행한다. 이후 `main`에 콘텐츠나 앱 변경을 push하면 자동 재배포된다.

주소는 `<계정>.github.io` 이름의 저장소면 루트 주소, 다른 이름이면 `/<저장소명>/` 주소다. workflow가 Pages 설정에서 `base_path`와 실제 URL을 읽으므로 저장소 이름을 코드에 고정할 필요가 없다. GitHub Pages에 사용자 도메인을 설정한 경우에도 그 설정을 읽는다.

## 공개 후 계속 고치기

**파일 편집 → commit → push → 자동 검증·빌드 → 재배포**가 반복된다. GitHub 웹에서 JSON·Markdown을 편집하고 commit해도 같은 배포 흐름이 실행된다. PR은 정적 빌드·타입 검사만 하며 공개 사이트를 바꾸지 않는다. `main` 반영 후 배포한다. 이전 내용으로 돌아가려면 해당 수정 commit을 revert해 다시 push한다.

글이 늘어도 레이아웃 파일을 매번 수정하지 않는다. 내용은 `content/`, 화면은 `src/`, 정적 자산은 `public/`에서 관리한다. 관리자 로그인·DB 없이도 공개 후 계속 편집할 수 있는 구조다.

## 빌드 범위와 출처

현재 배포 앱은 [Next.js 정적 내보내기](https://nextjs.org/docs/app/guides/static-exports)를 사용하고, `out/`만 [GitHub Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)에 전달한다. API·원본 컴포넌트 레지스트리·원작자의 추천사/후원/개인 프로필은 배포 앱에 포함하지 않았다. 내부 역량 보고서·비공개 저장소·운영 데이터는 빌드 입력이 아니다.

Chanh Dai의 MIT 고지는 상위 `LICENSE`에 유지한다. 공개 파일에도 같은 고지를 포함한다. Geist 글꼴의 OFL 고지는 `public/fonts/LICENSE.txt`, Pretendard 고지는 `public/fonts/Pretendard-LICENSE.txt`에 있다.
