# Personal portfolio app

This repository is the deployed GitHub Pages app. It no longer carries the
upstream chanhdai.com source; only its MIT notice remains.
`README.md` has the commands; the editing notes (which file holds what, deploy
and counting rules) are in git-ignored `private/EDITING.md`. Read the relevant installed Next.js
guide in `node_modules/next/dist/docs/` before changing framework behavior.

- Keep ClassicMate (app, pipeline, engine) as one project; VQA is the other.
- Do not invent metrics, commit history, proficiency, or project release status.
- Public content is curated JSON/Markdown in `content/`; internal archive and
  original private project code must stay outside this repository.
- `src/lib/example-run.json` is generated: the signal chain ships the engine's
  results for the invented example, not its rules. Regenerate it with the private
  generator kept outside the repository; never hand-edit it or move engine rules
  into `src/`.
- Stack entries describe concrete use; Rust is AI implementation collaboration.
- `history.json` records verified branch snapshots and author `manu` only.
  It includes merge/documentation/AI-assisted commits, not a hand-written ratio.
- Keep authorship/update timestamps off the UI. Project and commit dates matter.
- Preserve Chanh Dai's MIT notice (`LICENSE`, `public/LICENSE`) and the
  Pretendard OFL notice.
- Use local development at 127.0.0.1. Test the `/portfolio` base path before deploy.
- Validate with `npm test`, `npm run build`, and `npm run check-types`.
- Push/merge `main` to deploy through `.github/workflows/github-pages.yml`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
