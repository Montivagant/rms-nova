"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PortalShell from "./PortalShell";
import type { PortalContext } from "@lib/data-sources";

interface PortalProvidersProps {
  children: ReactNode;
  isAuthenticated: boolean;
  hasCookieSession: boolean;
  portalContext: PortalContext;
}

export default function PortalProviders({
  children,
  isAuthenticated,
  hasCookieSession,
  portalContext
}: PortalProvidersProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <PortalShell
        isAuthenticated={isAuthenticated}
        hasCookieSession={hasCookieSession}
        portalContext={portalContext}
      >
        {children}
      </PortalShell>
    </QueryClientProvider>
  );
}
