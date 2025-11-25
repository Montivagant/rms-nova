import Link from "next/link";
import { Button, Card } from "@nova/design-system";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.container}>
      <Card title="Nova RMS Superadmin" className={styles.heroCard}>
        <p className={styles.copy}>
          Monitor tenant registrations and oversee platform onboarding. Choose a workspace to get started.
        </p>
        <nav className={styles.actions}>
          <Link href="/registrations" className={styles.linkWrapper}>
            <Button size="lg">View pending registrations</Button>
          </Link>
        </nav>
      </Card>
    </main>
  );
}
