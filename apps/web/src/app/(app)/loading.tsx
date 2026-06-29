// Shown during route transitions inside the authenticated app shell while the
// next segment streams in. Mirrors the page container so the layout doesn't jump.
export default function AppLoading() {
  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
      <div className="h-8 w-48 rounded-xl skeleton" />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="h-28 rounded-2xl skeleton" />
        <div className="h-28 rounded-2xl skeleton" />
        <div className="h-28 rounded-2xl skeleton" />
      </div>
      <div className="space-y-3">
        <div className="h-16 rounded-2xl skeleton" />
        <div className="h-16 rounded-2xl skeleton" />
        <div className="h-16 rounded-2xl skeleton" />
      </div>
    </div>
  );
}
