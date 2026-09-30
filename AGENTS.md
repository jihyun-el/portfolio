# Personal portfolio app

This is the deployed app. Root `src/` is preserved upstream reference.
Read `README.md` for editing and commands. Read the relevant installed Next.js
guide in `node_modules/next/dist/docs/` before changing framework behavior.

- Keep ClassicMate (app, pipeline, engine) as one project; VQA is the other.
- Do not invent metrics, commit history, proficiency, or project release status.
- Public content is curated JSON/Markdown in `content/`; internal archive and
  original private project code must stay outside this repository.
- Stack entries describe concrete use; Rust is AI implementation collaboration.
- `history.json` records verified branch snapshots and author `manu` only.
  It includes merge/documentation/AI-assisted commits, not a hand-written ratio.
- Keep authorship/update timestamps off the UI. Project and commit dates matter.
- Preserve Chanh Dai's MIT and font OFL notices.
- Use local development at 127.0.0.1. Test the `/portfolio` base path before deploy.
- Validate with `npm test`, `npm run build`, and `npm run check-types`.
- Push/merge `main` to deploy through `.github/workflows/github-pages.yml`.
