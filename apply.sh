#!/usr/bin/env bash
# One-shot setup. Run from the root of your gpt-audit clone AFTER unzipping gpt-audit-scaffold.zip into it:
#   cd /path/to/gpt-audit && unzip -o ~/Downloads/gpt-audit-scaffold.zip -d . && bash apply.sh
set -euo pipefail
test -f plugin.json -a -f skills/gpt-audit/SKILL.md || { echo "run this from the repo root after unzipping the scaffold there"; exit 1; }

# Antigravity picks the skill up from .agents/skills while you build; keep it a symlink so there is one source of truth.
mkdir -p .agents/skills
if [ ! -e .agents/skills/gpt-audit ]; then
  ln -s ../../skills/gpt-audit .agents/skills/gpt-audit 2>/dev/null || cp -R skills/gpt-audit .agents/skills/gpt-audit
fi
chmod +x fixtures/serve.sh apply.sh

echo "node: $(node -v)"
npm test --silent >/dev/null && echo "tests: ok"

git add -A
git commit -m "scaffold: plan, manifests, skill, rules, fixtures, placeholders" || echo "nothing new to commit"
git push
echo
echo "Done. Open this folder in Antigravity and paste the Phase 0 prompt from docs/PLAN.md."
