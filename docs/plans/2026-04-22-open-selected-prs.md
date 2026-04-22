# Open Selected PRs with `o` — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make pressing `o` on the PR list open every selected PR in the browser when a multi-selection is active (visual range or picks), else open the single cursor row. Exit visual mode after a multi-open.

**Architecture:** Single-file change in `frontend/src/components/pr/PRTable.tsx`. Replace the current `onOpenExternal` action callback (which always opens one indexed row) with a new `handleOpenExternalSelection` callback that mirrors `handleCopySelection` at `PRTable.tsx:273`. No changes to the `o` keybinding, the vim store, the hint bar, or any PR detail page.

**Tech Stack:** React 18 + TypeScript, Zustand (`vimStore`), Wails runtime (`BrowserOpenURL`), tinykeys. No frontend test framework — verification is manual in `wails dev` plus `tsc` type-check.

**Reference:** Design doc at `docs/plans/2026-04-22-open-selected-prs-design.md`.

---

### Task 1: Add `handleOpenExternalSelection` callback

**Files:**
- Modify: `frontend/src/components/pr/PRTable.tsx`

**Step 1: Read the existing `handleCopySelection` as the reference pattern**

Open `frontend/src/components/pr/PRTable.tsx` and read lines 272–298 (the `handleCopySelection` block). This is the exact pattern we mirror: read `vim.getAllSelectedIndices()`, fall back to the cursor row, call `vim.exitVisualMode()` after the multi-selection action.

**Step 2: Add the new callback next to `handleCopySelection`**

Insert the following after `handleCopySelection`'s closing `}, [flash]);` at roughly `PRTable.tsx:298`, before the `const columns = useMemo(...)` block at roughly `PRTable.tsx:300`:

```ts
  /** Open handler for the 'o' keybinding — opens visual range + picked rows (or single cursor row) in the browser. */
  const handleOpenExternalSelection = useCallback((fallbackIndex: number) => {
    const vim = useVimStore.getState();
    const rows = tableRowsRef.current;

    const indices = vim.getAllSelectedIndices();

    let prsToOpen: github.PullRequest[];
    if (indices.length > 0) {
      prsToOpen = indices.map((i) => rows[i]).filter(Boolean);
    } else if (fallbackIndex >= 0 && rows[fallbackIndex]) {
      prsToOpen = [rows[fallbackIndex]];
    } else {
      return;
    }

    for (const pr of prsToOpen) BrowserOpenURL(pr.url);

    if (indices.length > 0) vim.exitVisualMode();
  }, []);
```

**Step 3: Wire the callback into the `onOpenExternal` action registration**

Find the action registration at `PRTable.tsx:223`:

```ts
      onOpenExternal: (index: number) => {
        const pr = getRows()[index];
        if (pr) BrowserOpenURL(pr.url);
      },
```

Replace with:

```ts
      onOpenExternal: handleOpenExternalSelection,
```

**Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: exits 0 with no errors.

**Step 5: Commit**

```bash
git add frontend/src/components/pr/PRTable.tsx
git commit -m "Open all selected PRs with 'o' on the PR list"
```

---

### Task 2: Manual verification in `wails dev`

**Files:** none changed — behavior verification only.

**Step 1: Start the dev app**

Run: `make dev` (or `wails dev`) from the repo root.
Expected: Wails dev window opens showing the PR list.

**Step 2: Single-row regression check**

Navigate to a PR list page (My PRs, Review Requests, etc.). With no visual mode and no picks, press `j`/`k` to move the cursor, then press `o`.
Expected: exactly the cursor PR opens in the browser. Unchanged from before.

**Step 3: Visual range multi-open**

Press `v` to enter visual mode. Press `j` three times to extend the range. Press `o`.
Expected: four PRs open in the browser (one per tab). Visual mode exits — the highlighted range clears. Cursor row remains where it was.

**Step 4: Picks multi-open**

Press `Space` on three non-adjacent rows to pick them. Press `o`.
Expected: those three PRs open in the browser. Picks clear. Visual mode was never active; cursor row remains.

**Step 5: Mixed range + picks**

Press `v`, move `j j`, then `Space` on a far-away non-adjacent row. Press `o`.
Expected: the visual range (three rows) plus the one picked row all open. Visual mode exits and picks clear.

**Step 6: PR detail regression check**

Open a PR (press `Enter`) → go to the Commits tab (`5` or `l` until Commits). Press `j` to select a commit, press `o`.
Expected: the single commit URL opens. No extra tabs. PR detail behavior unchanged.

**Step 7: Stop the dev app**

Close the Wails window or `Ctrl+C` the dev process.

**Step 8: No commit needed — verification only.**

If any expected behavior does not match, stop and return to Task 1.

---

## Notes on test discipline

The frontend has no automated test framework (no Vitest / Jest / Playwright configured in `frontend/package.json`). TDD is therefore inapplicable here and the plan substitutes manual verification under `wails dev`. If/when a test harness is added, this change is a natural candidate for a `userEvent.keyboard('o')` test against a rendered `PRTable` with a mocked `BrowserOpenURL`, but that's out of scope.

## Done criteria

1. `tsc --noEmit` passes.
2. All six manual verification steps in Task 2 behave as described.
3. One commit on the branch touching only `frontend/src/components/pr/PRTable.tsx`.
