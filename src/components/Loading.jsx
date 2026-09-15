// =====================================================
// Reusable Loading spinner / skeleton component
// =====================================================

function Loading({ size = "md", message = "", fullPage = false }) {
  const sizes = {
    sm: "h-5 w-5 border-2",
    md: "h-8 w-8 border-4",
    lg: "h-12 w-12 border-4",
  };

  const spinner = (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`animate-spin rounded-full border-blue-200 border-t-blue-600 dark:border-slate-700 dark:border-t-blue-400 ${sizes[size] ?? sizes.md}`}
      />
      {message && (
        <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
      )}
    </div>
  );

  if (fullPage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        {spinner}
      </div>
    );
  }

  return (
    <div className="flex min-h-[200px] items-center justify-center">
      {spinner}
    </div>
  );
}

export default Loading;
