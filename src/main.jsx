import "./instrument";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import { AuthProvider } from "./auth/useAuth.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { clearBootReloadFlag, installBootRecovery } from "./lib/bootRecovery";
import App from "./App.jsx";
import { CONFIG } from "./config";

const customerAdminRedirect = import.meta.env.VITE_APP_SURFACE === "customer"
  && window.location.pathname.startsWith("/admin");

if (customerAdminRedirect) {
  const target = new URL("/admin", CONFIG.ADMIN_APP_URL);
  target.search = window.location.search;
  target.hash = window.location.hash;
  window.location.replace(target.toString());
} else {
  installBootRecovery();

  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <ErrorBoundary
            name="App"
            title="Macros and Mamas hit a snag"
            message="Try refreshing. If this keeps happening, force-close the home-screen app and reopen — or tell Tech Guy at macrosandmamas.com/support."
          >
            <App />
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </StrictMode>,
  );

  window.__MAM_BOOTED__ = true;
  clearBootReloadFlag();
}
