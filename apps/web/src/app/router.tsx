import { BrowserRouter, Route, Routes } from 'react-router';
import { lazy, Suspense, type ReactNode } from 'react';
import { AppShell } from '../shared/ui/AppShell.js';
import { ProtectedRoute } from '../features/auth/ProtectedRoute.js';
import { AdminRoute } from '../features/auth/AdminRoute.js';
import { GuestOnlyRoute } from '../features/auth/GuestOnlyRoute.js';
import { DashboardPage } from '../features/dashboard/DashboardPage.js';
const LandingPage = lazy(async () =>
  import('../features/landing/LandingPage.js').then((module) => ({ default: module.LandingPage }))
);
const LoginPage = lazy(async () =>
  import('../features/auth/LoginPage.js').then((module) => ({ default: module.LoginPage }))
);
const RegisterPage = lazy(async () =>
  import('../features/auth/RegisterPage.js').then((module) => ({ default: module.RegisterPage }))
);
const NotFoundPage = lazy(async () =>
  import('./NotFoundPage.js').then((module) => ({ default: module.NotFoundPage }))
);
const ScannerPage = lazy(async () =>
  import('../features/scanner/ScannerPage.js').then((module) => ({ default: module.ScannerPage }))
);
const ScannerHistoryPage = lazy(async () =>
  import('../features/scanner/ScannerHistoryPage.js').then((module) => ({
    default: module.ScannerHistoryPage
  }))
);
const DocumentExtractionPage = lazy(async () =>
  import('../features/scanner/DocumentExtractionPage.js').then((module) => ({
    default: module.DocumentExtractionPage
  }))
);
const CopilotPage = lazy(async () =>
  import('../features/copilot/CopilotPage.js').then((module) => ({ default: module.CopilotPage }))
);
const ArenaHubPage = lazy(async () =>
  import('../features/arena/ArenaHubPage.js').then((module) => ({ default: module.ArenaHubPage }))
);
const ArenaLobbyPage = lazy(async () =>
  import('../features/arena/ArenaLobbyPage.js').then((module) => ({
    default: module.ArenaLobbyPage
  }))
);
const ArenaGamePage = lazy(async () =>
  import('../features/arena/ArenaGamePage.js').then((module) => ({ default: module.ArenaGamePage }))
);
const ArenaResultsPage = lazy(async () =>
  import('../features/arena/ArenaResultsPage.js').then((module) => ({
    default: module.ArenaResultsPage
  }))
);
const ArenaReplayPage = lazy(async () =>
  import('../features/arena/ArenaReplayPage.js').then((module) => ({
    default: module.ArenaReplayPage
  }))
);
const SourcePage = lazy(async () =>
  import('../features/copilot/SourcePage.js').then((module) => ({ default: module.SourcePage }))
);
const AdminDocumentsPage = lazy(async () =>
  import('../features/admin-documents/AdminDocumentsPage.js').then((module) => ({
    default: module.AdminDocumentsPage
  }))
);
const SettingsPage = lazy(async () =>
  import('../features/settings/SettingsPage.js').then((module) => ({
    default: module.SettingsPage
  }))
);
export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route
            index
            element={
              <LazyPage>
                <LandingPage />
              </LazyPage>
            }
          />
          <Route element={<GuestOnlyRoute />}>
            <Route
              path="login"
              element={
                <LazyPage>
                  <LoginPage />
                </LazyPage>
              }
            />
            <Route
              path="register"
              element={
                <LazyPage>
                  <RegisterPage />
                </LazyPage>
              }
            />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route
              path="settings"
              element={
                <LazyPage>
                  <SettingsPage />
                </LazyPage>
              }
            />
            <Route
              path="scanner"
              element={
                <LazyPage>
                  <ScannerHistoryPage />
                </LazyPage>
              }
            />
            <Route
              path="scanner/new"
              element={
                <LazyPage>
                  <ScannerPage />
                </LazyPage>
              }
            />
            <Route
              path="scanner/extract"
              element={
                <LazyPage>
                  <DocumentExtractionPage />
                </LazyPage>
              }
            />
            <Route
              path="copilot"
              element={
                <LazyPage>
                  <CopilotPage />
                </LazyPage>
              }
            />
            <Route
              path="arena"
              element={
                <LazyPage>
                  <ArenaHubPage />
                </LazyPage>
              }
            />
            <Route
              path="arena/lobby/:code"
              element={
                <LazyPage>
                  <ArenaLobbyPage />
                </LazyPage>
              }
            />
            <Route
              path="arena/games/:id"
              element={
                <LazyPage>
                  <ArenaGamePage />
                </LazyPage>
              }
            />
            <Route
              path="arena/games/:id/results"
              element={
                <LazyPage>
                  <ArenaResultsPage />
                </LazyPage>
              }
            />
            <Route
              path="arena/games/:id/replay"
              element={
                <LazyPage>
                  <ArenaReplayPage />
                </LazyPage>
              }
            />
            <Route
              path="documents/:documentId/pages/:pageNumber"
              element={
                <LazyPage>
                  <SourcePage />
                </LazyPage>
              }
            />
            <Route
              path="scanner/:analysisId"
              element={
                <LazyPage>
                  <ScannerPage />
                </LazyPage>
              }
            />
          </Route>
          <Route element={<AdminRoute />}>
            <Route
              path="admin/documents"
              element={
                <LazyPage>
                  <AdminDocumentsPage />
                </LazyPage>
              }
            />
          </Route>
          <Route
            path="*"
            element={
              <LazyPage>
                <NotFoundPage />
              </LazyPage>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<p>Đang tải trang…</p>}>{children}</Suspense>;
}
