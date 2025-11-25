import "./globals.css";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import PortalProviders from "@components/PortalProviders";
import { getPortalAccessToken } from "@lib/env";
import { getPortalContext } from "@lib/data-sources";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get("portal_access_token")?.value ?? null;
  const envToken = getPortalAccessToken();
  const isAuthenticated = Boolean(cookieToken ?? envToken);
  const hasCookieSession = Boolean(cookieToken);
  const portalContext = await getPortalContext();

  return (
    <html lang="en">
      <body>
        <PortalProviders
          isAuthenticated={isAuthenticated}
          hasCookieSession={hasCookieSession}
          portalContext={portalContext}
        >
          {children}
        </PortalProviders>
      </body>
    </html>
  );
}
