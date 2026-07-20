import { lazy, Suspense } from 'react';
const Application = lazy(() => import('./Application.js'));
export function App() {
  return (
    <Suspense fallback={<p>Đang tải MarxMatrix…</p>}>
      <Application />
    </Suspense>
  );
}
