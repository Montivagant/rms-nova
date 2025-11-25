"use client";

import { useState, type ChangeEvent } from "react";
import { FormField, Select } from "@nova/design-system";
import RegistrationList from "@components/RegistrationList";
import type { RegistrationStatus } from "@lib/registrations";
import styles from "./page.module.css";

export default function RegistrationsPage() {
  const [status, setStatus] = useState<RegistrationStatus>("pending");

  const handleStatusChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setStatus(event.target.value as RegistrationStatus);
  };

  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Tenant registrations</h1>
          <p className={styles.subtitle}>Review pending requests and track recent decisions.</p>
        </div>
        <FormField label="Status filter" className={styles.filterField}>
          <Select value={status} onChange={handleStatusChange}>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </Select>
        </FormField>
      </header>
      <RegistrationList status={status} />
    </main>
  );
}
