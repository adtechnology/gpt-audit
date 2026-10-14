---
trigger: always_on
---

# gpt-audit workspace rules

- Before any task in this repo, read `AGENTS.md` and the section of `docs/PLAN.md` the prompt names. The plan is the spec; when the plan and an existing file disagree, say so instead of silently picking one.
- Scripts under `skills/gpt-audit/scripts/` are plain Node 22 ESM with no runtime dependencies. Do not add packages.
- The collector `collect-gpt.js` must stay a single self-contained function under 10 KB with no imports: it is pasted into `evaluate_script`.
- Output goes to `out/` (git-ignored). Never commit `out/`.
- Tests live in `skills/gpt-audit/scripts/tests/*.test.js` and run with `npm test` (`node --test`).
- Browser work follows `rules/no-ad-interaction.md`: never touch ad creatives, always accept the CMP, one page load per URL, no `display()`/`refresh()` on pages you do not own.
- Commit at the end of each phase with the message the plan gives.
