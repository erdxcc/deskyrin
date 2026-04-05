import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function PrivateRoute({ children }: { children: ReactNode }) {
  const { token, loading } = useAuth();
  const loc = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <span className="animate-pulse text-sm tracking-wide text-secondary">
          Loading…
        </span>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" state={{ from: loc }} replace />;
  }

  return <>{children}</>;
}
