"use client";

import "./globals.css";
import type { ReactNode } from "react";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SuperadminShell from "@components/SuperadminShell";

export default function RootLayout({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <html lang="en">
      <body>
        <QueryClientProvider client={queryClient}>
          <SuperadminShell>{children}</SuperadminShell>
        </QueryClientProvider>
      </body>
    </html>
  );
}
