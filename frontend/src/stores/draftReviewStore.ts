import { create } from "zustand";

export interface DraftComment {
  id: string;
  path: string;
  line: number;
  body: string;
}

interface DraftReviewState {
  /** Draft comments keyed by PR node ID */
  drafts: Record<string, DraftComment[]>;

  addDraft: (prNodeId: string, path: string, line: number, body: string) => void;
  removeDraft: (prNodeId: string, draftId: string) => void;
  clearDrafts: (prNodeId: string) => void;
  getDrafts: (prNodeId: string) => DraftComment[];
}

let nextId = 0;

export const useDraftReviewStore = create<DraftReviewState>((set, get) => ({
  drafts: {},

  addDraft: (prNodeId, path, line, body) => {
    const id = `draft-${++nextId}`;
    set((s) => ({
      drafts: {
        ...s.drafts,
        [prNodeId]: [...(s.drafts[prNodeId] || []), { id, path, line, body }],
      },
    }));
  },

  removeDraft: (prNodeId, draftId) => {
    set((s) => ({
      drafts: {
        ...s.drafts,
        [prNodeId]: (s.drafts[prNodeId] || []).filter((d) => d.id !== draftId),
      },
    }));
  },

  clearDrafts: (prNodeId) => {
    set((s) => ({
      drafts: { ...s.drafts, [prNodeId]: [] },
    }));
  },

  getDrafts: (prNodeId) => get().drafts[prNodeId] || [],
}));
