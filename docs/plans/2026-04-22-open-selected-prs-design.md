# Open Selected PRs with `o`

## Problem

On the PR list, pressing `o` opens only the cursor row in the browser, even when multiple rows are selected via visual mode (`v`) or picks (`Space`). Users with a multi-row selection expect `o` to open every selected PR, mirroring how `c` already copies every selected PR.

## Behavior

On the PR list (`PRTable`), pressing `o`:

- If visual mode is active OR any rows are picked: open each selected PR's URL in the browser, then exit visual mode and clear picks (same post-action as `c`).
- Otherwise: open the single cursor row's PR. Unchanged from today.

PR detail pages are untouched. They register their own `onOpenExternal` per tab (commits, checks, etc.) and those selections belong to different lists, not PRs.

No new keybinding. No new hint bar entry. The `o` hint still reads "open in GitHub".

## Implementation

Single file: `frontend/src/components/pr/PRTable.tsx`.

Model the change on the existing `handleCopySelection` at `PRTable.tsx:273`, which already implements the "selected set or fallback to cursor" pattern.

Add a callback:

```ts
const handleOpenExternalSelection = useCallback((fallbackIndex: number) => {
  const vim = useVimStore.getState();
  const rows = tableRowsRef.current;
  const indices = vim.getAllSelectedIndices();

  const prs = indices.length > 0
    ? indices.map((i) => rows[i]).filter(Boolean)
    : (fallbackIndex >= 0 && rows[fallbackIndex] ? [rows[fallbackIndex]] : []);

  for (const pr of prs) BrowserOpenURL(pr.url);
  if (indices.length > 0) vim.exitVisualMode();
}, []);
```

Replace the current registration at `PRTable.tsx:223`:

```ts
onOpenExternal: handleOpenExternalSelection,
```

Nothing else changes. `useVimNavigation.ts` still calls `onOpenExternal(selectedIndex)`; the callback now decides whether to use that index or the multi-selection set.

## Edge cases

- Opening many tabs at once: no confirmation threshold, matching `c`. Browsers may queue the openings; acceptable.
- No `useEffect` dep adjustments needed. The action registration already re-runs every render.
- `exitVisualMode` clears both visual state and picks, consistent with `c`.

## Testing

Manual verification in the running app:

1. Single cursor row, press `o`: opens one PR. Regression check.
2. `v` then `j j j`, press `o`: opens the visual range. Visual mode exits.
3. `Space` on three non-adjacent rows, press `o`: opens those three. Picks clear.
4. PR detail page, commits tab, press `o`: still opens the single indexed commit. No regression.

## Non-goals

- No new action on the store.
- No keybinding changes.
- No confirmation prompt for large selections.
- No change to PR detail pages.
