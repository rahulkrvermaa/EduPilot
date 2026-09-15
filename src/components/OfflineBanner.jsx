import { useEffect, useState } from "react";

function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="alert"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-amber-300 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
    >
      You are offline. Changes won't be saved until you reconnect.
    </div>
  );
}

export default OfflineBanner;
