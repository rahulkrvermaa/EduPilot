function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600 dark:border-slate-700 dark:border-t-blue-400" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Loading…
        </p>
      </div>
    </div>
  );
}

export default RouteFallback;
