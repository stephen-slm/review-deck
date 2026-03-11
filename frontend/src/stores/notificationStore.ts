import { create } from "zustand";
import { storage } from "../../wailsjs/go/models";
import {
  GetNotifications,
  GetUnreadCount,
  MarkRead,
  MarkAllRead,
  Delete,
  ClearAll,
} from "../../wailsjs/go/services/NotificationService";

/** Maximum number of notifications to load at once. */
const LOAD_LIMIT = 200;

interface NotificationState {
  /** All loaded notifications, newest first. */
  notifications: storage.AppNotification[];
  /** Number of unread notifications (badge count). */
  unreadCount: number;
  /** Whether the initial load is in progress. */
  isLoading: boolean;

  /** Load notifications from the backend. */
  loadNotifications: () => Promise<void>;
  /** Refresh just the unread count (lightweight). */
  refreshUnreadCount: () => Promise<void>;
  /** Mark a single notification as read. */
  markRead: (id: number) => Promise<void>;
  /** Mark all notifications as read. */
  markAllRead: () => Promise<void>;
  /** Delete a single notification. */
  deleteNotification: (id: number) => Promise<void>;
  /** Clear all notifications. */
  clearAll: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,

  loadNotifications: async () => {
    set({ isLoading: true });
    try {
      const [notifications, unreadCount] = await Promise.all([
        GetNotifications(LOAD_LIMIT),
        GetUnreadCount(),
      ]);
      set({
        notifications: notifications || [],
        unreadCount,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false });
    }
  },

  refreshUnreadCount: async () => {
    try {
      const unreadCount = await GetUnreadCount();
      set({ unreadCount });
    } catch {
      // Ignore errors for badge refresh.
    }
  },

  markRead: async (id: number) => {
    try {
      await MarkRead(id);
      set((s) => ({
        notifications: s.notifications.map((n) => {
          if (n.id !== id) return n;
          const updated = storage.AppNotification.createFrom(n);
          updated.read = true;
          return updated;
        }),
        unreadCount: Math.max(0, s.unreadCount - 1),
      }));
    } catch {
      // Ignore — will reconcile on next load.
    }
  },

  markAllRead: async () => {
    try {
      await MarkAllRead();
      set((s) => ({
        notifications: s.notifications.map((n) => {
          const updated = storage.AppNotification.createFrom(n);
          updated.read = true;
          return updated;
        }),
        unreadCount: 0,
      }));
    } catch {
      // Ignore.
    }
  },

  deleteNotification: async (id: number) => {
    const wasUnread = get().notifications.find((n) => n.id === id && !n.read);
    try {
      await Delete(id);
      set((s) => ({
        notifications: s.notifications.filter((n) => n.id !== id),
        unreadCount: wasUnread ? Math.max(0, s.unreadCount - 1) : s.unreadCount,
      }));
    } catch {
      // Ignore.
    }
  },

  clearAll: async () => {
    try {
      await ClearAll();
      set({ notifications: [], unreadCount: 0 });
    } catch {
      // Ignore.
    }
  },
}));
