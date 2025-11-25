"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PropsWithChildren } from "react";
import { Button } from "@nova/design-system";
import styles from "./SuperadminShell.module.css";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/registrations", label: "Registrations" },
  { href: "/billing", label: "Billing" }
] as const;

export default function SuperadminShell({ children }: PropsWithChildren) {
  const pathname = usePathname();

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            *
          </span>
          <div className={styles.brandCopy}>
            <span className={styles.brandName}>Nova RMS</span>
            <span className={styles.brandSection}>Superadmin</span>
          </div>
        </div>

        <nav className={styles.nav} aria-label="Primary">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === item.href
                : pathname?.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={[styles.navLink, isActive ? styles.navLinkActive : ""].filter(Boolean).join(" ")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className={styles.headerMeta}>
          <span className={styles.envBadge}>dev</span>
          <Button variant="ghost" size="sm" className={styles.profileButton}>
            superadmin@nova.dev
          </Button>
        </div>
      </header>

      <div className={styles.mainArea}>{children}</div>
    </div>
  );
}

