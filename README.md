# 우지현 포트폴리오

ClassicMate와 멀티모달 VQA 프로젝트를 담은 포트폴리오 사이트다. 주소는 [jihyun-el.github.io/portfolio](https://jihyun-el.github.io/portfolio/)다.

Next.js 정적 내보내기로 만들고 GitHub Pages로 배포한다. 내용은 `content/`의 JSON과 Markdown, 화면은 `src/`, 정적 자산은 `public/`에 있다.

## 실행

Node.js 24를 사용한다.

```sh
npm ci --ignore-scripts
npm run dev          # 개발 서버
npm test
npm run build        # 정적 파일을 out/에 만든다
npm run check-types
npm run preview      # http://127.0.0.1:4173/
```

## 라이선스와 출처

- `src/app/globals.css`의 도식 스타일 일부는 MIT 라이선스 코드를 고쳐 쓴 것이다. 원 고지는 `LICENSE`와 `public/LICENSE`에 있다.
- 글꼴은 Pretendard(OFL)이며 고지는 `public/fonts/Pretendard-LICENSE.txt`에 있다.
- 식은 KaTeX(MIT)로 조판하며 KaTeX 글꼴(OFL)이 함께 배포된다.
- 기술 스택의 단색 로고(`src/lib/brand-icons.json`) 가운데 문자열로 적힌 것은 Simple Icons 16.34.0(CC0)의 SVG 경로다. `huggingface`는 Hugging Face가 배포하는 공식 로고 SVG를 선 그림으로 다시 칠한 것이다. `riverpod`는 Riverpod 저장소(MIT)의 `website/static/img/logo.svg`, `librosa`는 librosa 저장소(ISC)의 `docs/img/librosa_logo_dark.svg`에서 글자를 뺀 표식을 한 색으로 그린 것이다. `verovio`와 `music21`은 이 사이트용으로 그린 음표 그림이며 공식 로고가 아니다. 각 상표는 해당 소유자의 것이다.
