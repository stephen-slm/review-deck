Future Work (Parking Lot)
Purpose: track forward-looking ideas without committing scope.

Themes
- [priority:high] [effort:M] [area:frontend] Add theme system with Light + Nord, CSS vars, settings toggle, and previews.
- [priority:med] [effort:M] [area:frontend] Add more palettes (High-contrast, Solarized Dark/Light) and allow per-page overrides for demos.
- [priority:low] [effort:S] [area:frontend] Theme-aware charts/markdown/code blocks with tokenized palettes.

PR UX (solo)
- [priority:med] [effort:M] [area:frontend] Smart inbox: My PRs, Waiting on me, Blocked (CI/conflicts), Ready to merge.
- [priority:med] [effort:M] [area:frontend] Aging nudges for stale PRs and long-running CI; surface timers in cards.
- [priority:high] [effort:L] [area:fullstack] Stacked changes support with per-stack status and land-stack flow.
- [priority:med] [effort:M] [area:frontend] Resolve/unresolve quick jump: next unresolved thread, checklist view.

Automation / AI
- [priority:med] [effort:M] [area:frontend] AI draft PR summaries and changelog snippets for authoring speed.
- [priority:med] [effort:M] [area:backend] Reviewer suggestion based on ownership and recent authorship.
- [priority:low] [effort:M] [area:backend] Auto-detect missing reviewers/tests/labels; propose fixes before merge.

Queues & Stacks
- [priority:high] [effort:M] [area:backend] Personal merge queue with auto-retry, batch, and hold-until-green.
- [priority:med] [effort:S] [area:frontend] Label/priority quick edits from PR detail; saved filters (hotfix/customer/release).
- [priority:med] [effort:L] [area:fullstack] Branch protection awareness and policy-as-code for PR size/owner rules.

Notifications
- [priority:med] [effort:S] [area:frontend] Daily digest of actionable items (CI fixed, conflicts, review requested).
- [priority:low] [effort:S] [area:frontend] Focus mode / snooze windows to reduce noise.

Safety Rails
- [priority:med] [effort:M] [area:backend] Secret/supply-chain/license checks pre-merge; surface in PR checks tab.
- [priority:low] [effort:S] [area:frontend] Pre-merge prompts: size guardrail, tests reminder, missing reviewers.
