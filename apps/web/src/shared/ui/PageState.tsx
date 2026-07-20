export function PageState({ children }: { children: React.ReactNode }) {
  return (
    <section aria-live="polite" className="page-state">
      {children}
    </section>
  );
}
