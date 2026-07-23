import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import { AuthProvider } from "./auth/useAuth.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary
          name="App"
          title="Macros and Mamas hit a snag"
          message="Try refreshing. If this keeps happening, force-close the home-screen app and reopen."
        >
          <App />
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
