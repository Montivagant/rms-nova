"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@nova/design-system";
import styles from "./PortalShell.module.css";
import { portalNavLinks } from "@lib/navigation";
import { useState, useTransition } from "react";
import type { PortalContext } from "@lib/data-sources";
import { hasPermission } from "@lib/capabilities";
import { hasFeatureFlag } from "@lib/feature-flags";

interface PortalShellProps {
  children: ReactNode;
  isAuthenticated: boolean;
  hasCookieSession: boolean;
  portalContext: PortalContext;
}

export default function PortalShell({
  children,
  isAuthenticated,
  hasCookieSession,
  portalContext
}: PortalShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const enabledModules = new Set(
    portalContext.modules.filter((module) => module.enabled).map((module) => module.moduleId)
  );
  const visibleLinks = portalNavLinks.filter((link) => {
    const moduleEnabled = !link.moduleId || enabledModules.has(link.moduleId);
    const flagEnabled =
      !link.featureFlag ||
      hasFeatureFlag(portalContext, link.featureFlag.moduleId, link.featureFlag.key);
    return moduleEnabled && flagEnabled;
  });
  const planLabel = portalContext.tenant.planName ?? "Plan pending";
  const planChipText = planLabel.toLowerCase().includes("plan") ? planLabel : `${planLabel} plan`;
  const locationCount = portalContext.tenant.locationCount ?? null;
  const hasMultiLocation = hasFeatureFlag(portalContext, "global", "multi_location");
  const locationLabel =
    locationCount && locationCount > 0
      ? `${locationCount} location${locationCount === 1 ? "" : "s"}`
      : hasMultiLocation
        ? "Location data pending"
        : "Multi-location disabled";
  const nextPayoutDisplay =
    portalContext.tenant.nextPayout ??
    (portalContext.tenant.nextPayoutAt
      ? new Date(portalContext.tenant.nextPayoutAt).toLocaleDateString("en-US", {
          month: "short",
          day: "2-digit",
          year: "numeric"
        })
      : null);
  const payoutLabel = nextPayoutDisplay ? `Next payout ${nextPayoutDisplay}` : "Payout schedule pending";
  const canInviteTeammate = hasPermission(portalContext, [
    "identity.users.invite",
    "identity.users.create"
  ]);
  const canRecordSale = hasPermission(portalContext, ["pos.tickets.create", "pos.tickets.open"]);
  const showSignOut = isAuthenticated && hasCookieSession;
  const handleRecordSale = () => {
    if (!canRecordSale) return;
    router.push("/pos");
  };

  const handleLogout = () => {
    setError(null);
    startTransition(async () => {
      try {
        await fetch("/api/session", { method: "DELETE" });
        router.push("/login");
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  };

  return (
    <div className={styles.container}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span>Nova Portal</span>
          <span className={styles.plan}>{planChipText}</span>
        </div>
        <nav className={styles.nav}>
          {visibleLinks.map((link) => {
            const isActive = pathname === link.href;
            const className = isActive ? `${styles.link} ${styles.linkActive}` : styles.link;
            return (
              <Link key={link.href} href={link.href} className={className}>
                <span>{link.label}</span>
                <span>{link.description}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className={styles.content}>
        <header className={styles.header}>
          <div className={styles.headerTenant}>
            <h1>{portalContext.tenant.name}</h1>
            <span>
              {locationLabel} | {payoutLabel}
            </span>
          </div>
          <div className={styles.headerActions}>
            <Button
              size="sm"
              variant="ghost"
              disabled={!canInviteTeammate}
              type="button"
              title={!canInviteTeammate ? "Requires identity.users.invite" : undefined}
            >
              Invite teammate
            </Button>
            <Button
              size="sm"
              disabled={!canRecordSale}
               type="button"
              onClick={handleRecordSale}
              title={!canRecordSale ? "Requires pos.tickets.create" : undefined}
            >
              Record sale
            </Button>
            {showSignOut ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleLogout}
                disabled={isPending}
                type="button"
              >
                {isPending ? "Signing out..." : "Sign out"}
              </Button>
            ) : null}
          </div>
        </header>

        <main className={styles.main}>
          {error ? (
            <div className="badge badge--warning" style={{ marginBottom: "1rem" }}>
              {error}
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
