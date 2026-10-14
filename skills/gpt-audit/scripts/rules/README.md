# Rules

One file per rule, named after its id (`r01-slot-never-displayed.js`, `r02-dom-missing-or-duplicate.js`, ...).

Each file exports `default function (snapshot, network, context) → Finding[]` (`context.config` carries the optional publisher config) where a Finding is
`{ id, severity: "high" | "medium" | "low", slot: string | null, evidence: string, fix: string }`.

`analyze.js` imports every file in this folder, runs them in id order and writes the concatenated findings.
See `../../references/anomaly-catalog.md` for the catalog and `docs/PLAN.md` (Phase 2) for the spec.

Slots from GPT instances inside same-origin iframes are part of `snapshot.slots` with `slot.frame` set; rules that
reason about the main frame only filter on `!slot.frame` or use `snapshot.gpt.mainFrameSlotCount` (see R17).
