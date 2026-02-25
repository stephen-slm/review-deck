import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Sidebar } from "./components/layout/Sidebar";
import { ToastProvider } from "./components/ui/Toast";
import { DashboardPage } from "./pages/DashboardPage";
import { MyPRsPage } from "./pages/MyPRsPage";
import { ReviewRequestsPage } from "./pages/ReviewRequestsPage";
import { ReviewedByMePage } from "./pages/ReviewedByMePage";
import { SettingsPage } from "./pages/SettingsPage";
import { PRDetailPage } from "./pages/PRDetailPage";
import { usePollerEvents } from "./hooks/usePollerEvents";

function AppContent() {
  // Listen for backend poller events and push data into stores.
  usePollerEvents();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* macOS titlebar spacer — drag region */}
        <div className="wails-drag h-[52px] shrink-0" />
        <div className="flex-1 overflow-auto p-6">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/my-prs" element={<MyPRsPage />} />
            <Route
              path="/review-requests"
              element={<ReviewRequestsPage />}
            />
            <Route path="/reviewed" element={<ReviewedByMePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/pr/:nodeId" element={<PRDetailPage />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ToastProvider>
  );
}
