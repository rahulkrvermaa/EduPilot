import { Outlet } from "react-router-dom";

import Navbar from "./Navbar";
import Sidebar from "./Sidebar";
import OfflineBanner from "./OfflineBanner";
import { config, isProduction, isStaging } from "../config";

function Layout() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {!isProduction && (
        <div
          className={`fixed top-0 left-0 right-0 z-50 px-3 py-1 text-center text-xs font-semibold ${
            isStaging
              ? "bg-amber-500 text-amber-950"
              : "bg-slate-900 text-slate-100"
          }`}
        >
          {isStaging
            ? `STAGING — ${config.appName}`
            : `DEV — ${config.appName}`}
        </div>
      )}

      <Sidebar />

      <div className={`ml-64 ${!isProduction ? "pt-6" : ""}`}>
        <Navbar />

        <main className="pt-20 p-6">
          <Outlet />
        </main>
      </div>

      <OfflineBanner />
    </div>
  );
}

export default Layout;