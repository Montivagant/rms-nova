"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card } from "@nova/design-system";
import {
  registrationModuleDefaults,
  type RegistrationModuleDefault
} from "@nova/module-registry/defaults";
import type { Registration, RegistrationStatus } from "@lib/registrations";
import { decideRegistration, listRegistrations, updateRegistrationModules } from "@lib/registrations";
import RegistrationDecisionModal from "./RegistrationDecisionModal";
import styles from "./RegistrationList.module.css";

type Props = {
  status: RegistrationStatus;
};

type DecisionState = { open: false } | { open: true; registrationId: string };

const cloneModuleConfig = (modules?: RegistrationModuleDefault[]) =>
  (modules ?? registrationModuleDefaults).map(
    (module: RegistrationModuleDefault) => ({ ...module })
  );

type PayloadError = { payload?: { error?: { message?: string } } };

const hasPayloadError = (err: unknown): err is PayloadError =>
  Boolean(
    err &&
    typeof err === "object" &&
    "payload" in err &&
    (err as PayloadError).payload
  );

const resolveErrorMessage = (err: unknown, fallback: string) => {
  if (hasPayloadError(err) && typeof err.payload?.error?.message === "string") {
    return err.payload.error.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return fallback;
};

function formatSubmitted(createdAt?: string) {
  if (!createdAt) return "Submission time unavailable";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date(createdAt));
  } catch {
    return "Submission time unavailable";
  }
}

export default function RegistrationList({ status }: Props) {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [decisionState, setDecisionState] = useState<DecisionState>({ open: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [moduleMutations, setModuleMutations] = useState<string[]>([]);
  const [moduleFeedback, setModuleFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!moduleFeedback) return;
    const timeout = window.setTimeout(() => setModuleFeedback(null), 4000);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [moduleFeedback]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshNonce intentionally retriggers fetches.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    listRegistrations(status)
      .then((payload) => {
        if (!cancelled) {
          setRegistrations(payload.data ?? []);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.payload?.error?.message ?? err.message ?? "Failed to load registrations.");
          setRegistrations([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status, refreshNonce]);

  const hasRows = registrations.length > 0;

  const headline = useMemo(() => {
    if (loading) return "Loading registrations...";
    if (error) return "Unable to load registrations";
    if (!hasRows) return `No ${status} registrations`;
    return `${registrations.length} ${status} registration${registrations.length === 1 ? "" : "s"}`;
  }, [loading, error, hasRows, registrations.length, status]);

  const statusCopy: Record<RegistrationStatus, string> = useMemo(
    () => ({
      pending: "Pending review",
      approved: "Approved",
      rejected: "Rejected"
    }),
    []
  );

  const statusBadgeClasses = useMemo<Record<RegistrationStatus, string>>(
    () => ({
      pending: styles.badgePending,
      approved: styles.badgeApproved,
      rejected: styles.badgeRejected
    }),
    []
  );

  const checklistItems = useMemo(
    () => [
      { id: "owner-access", label: "Confirm owner login and role assignment" },
      { id: "module-toggles", label: "Toggle starter modules (POS, Inventory, Menu)" },
      { id: "billing-setup", label: "Queue billing profile + plan selection" },
      { id: "data-seed", label: "Inject sample menu & POS data (optional)" }
    ],
    []
  );

  const defaultModuleConfigs = useMemo<RegistrationModuleDefault[]>(() => cloneModuleConfig(), []);

  const handleDecision = async (
    registrationId: string,
    decision: "approve" | "reject",
    reason?: string
  ) => {
    const registration = registrations.find((item) => item.id === registrationId);
    const modules = cloneModuleConfig(registration?.modules ?? defaultModuleConfigs);
    await decideRegistration(registrationId, decision, reason, modules);
    setDecisionState({ open: false });
    setRefreshNonce((nonce) => nonce + 1);
  };

  const handleModuleToggle = async (registrationId: string, moduleKey: string) => {
    const target = registrations.find((item) => item.id === registrationId);
    if (!target || target.status !== "pending") return;

    const currentModules = cloneModuleConfig(target.modules ?? defaultModuleConfigs);
    const nextModules = currentModules.map((module) =>
      module.key === moduleKey ? { ...module, enabled: !module.enabled } : module
    );

    setRegistrations((prev) =>
      prev.map((item) => (item.id === registrationId ? { ...item, modules: nextModules } : item))
    );
    setModuleMutations((ids) => (ids.includes(registrationId) ? ids : [...ids, registrationId]));
    setModuleFeedback(null);
    try {
      await updateRegistrationModules(registrationId, nextModules);
      const businessName = target.business.legalName;
      setModuleFeedback(`${businessName} module toggles updated.`);
    } catch (err) {
      setRegistrations((prev) =>
        prev.map((item) => (item.id === registrationId ? { ...item, modules: currentModules } : item))
      );
      setError(resolveErrorMessage(err, "Failed to update modules. Please try again."));
      setModuleFeedback(null);
    } finally {
      setModuleMutations((ids) => ids.filter((id) => id !== registrationId));
    }
  };

  return (
    <section className={styles.container} aria-live="polite">
      <header className={styles.header}>
        <h2 className={styles.headline}>{headline}</h2>
        {moduleFeedback ? (
          <p className={styles.feedback} aria-live="polite">
            {moduleFeedback}
          </p>
        ) : null}
        {error ? (
          <p className={styles.error}>
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setRefreshNonce((nonce) => nonce + 1)}
              className={styles.retry}
            >
              Try again
            </button>
          </p>
        ) : null}
      </header>

      <div className={styles.grid}>
        {registrations.map((registration) => (
          <Card key={registration.id} title={registration.business.legalName} className={styles.card}>
            <div className={styles.cardBody}>
              <div className={styles.primaryMeta}>
                <span className={styles.label}>Primary contact</span>
                <span className={styles.value}>{registration.owner.email}</span>
              </div>
              <div className={styles.secondaryMeta}>
                <span className={`${styles.badge} ${statusBadgeClasses[registration.status]}`}>
                  {statusCopy[registration.status]}
                </span>
                <span className={styles.timestamp}>{formatSubmitted(registration.createdAt)}</span>
              </div>
            </div>

            {registration.decidedAt || registration.reason || registration.tenantId ? (
              <dl className={styles.decisionMeta}>
                {registration.tenantId ? (
                  <>
                    <dt>Tenant ID</dt>
                    <dd>{registration.tenantId}</dd>
                  </>
                ) : null}
                {registration.decidedAt ? (
                  <>
                    <dt>Decided</dt>
                    <dd>{formatSubmitted(registration.decidedAt)}</dd>
                  </>
                ) : null}
                {registration.reason ? (
                  <>
                    <dt>Reason</dt>
                    <dd>{registration.reason}</dd>
                  </>
                ) : null}
              </dl>
            ) : null}

            <div className={styles.checklistWrapper}>
              <div className={styles.checklistHeading}>
                <span className={styles.checklistTitle}>Onboarding checklist</span>
                <span className={styles.checklistCaption}>
                  {registration.status === "approved"
                    ? "Mark items as complete as you activate this tenant."
                    : "Checklist unlocks after approval."}
                </span>
              </div>
              <ul
                className={`${styles.checklist} ${
                  registration.status !== "approved" ? styles.checklistLocked : ""
                }`}
                aria-label={
                  registration.status === "approved"
                    ? "Onboarding checklist"
                    : "Onboarding checklist (locked until approval)"
                }
              >
                {checklistItems.map((item) => (
                  <li key={item.id} className={styles.checklistItem}>
                    <span
                      className={styles.checklistControl}
                      aria-hidden="true"
                      data-state={registration.status === "approved" ? "active" : "locked"}
                    />
                    <span className={styles.checklistLabel}>{item.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.toggleWrapper}>
              <div className={styles.toggleHeading}>
                <span className={styles.toggleTitle}>Module toggles</span>
                <span className={styles.toggleCaption}>
                  {registration.status === "pending"
                    ? "Configure modules before approval."
                    : "Reflects current tenant module state."}
                </span>
              </div>
              <div className={styles.toggleGrid}>
                {(registration.modules ?? defaultModuleConfigs).map((module) => {
                  const isPending = registration.status === "pending";
                  const isUpdating = moduleMutations.includes(registration.id);
                  const disabled = !isPending || isUpdating;
                  return (
                    <div
                      key={module.key}
                      className={`${styles.toggleOption} ${
                        disabled ? styles.toggleOptionLocked : ""
                      }`}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className={styles.toggleButton}
                          aria-pressed={module.enabled}
                          data-state={module.enabled ? "on" : "off"}
                          disabled={disabled}
                          onClick={() => handleModuleToggle(registration.id, module.key)}
                        >
                        {module.name}
                      </Button>
                      <p className={styles.toggleDescription}>
                        {module.category
                          ? `${module.category} module preset`
                          : "Toggle module availability for this tenant."}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className={styles.actions}>
              <Button
                type="button"
                onClick={() => setDecisionState({ open: true, registrationId: registration.id })}
              >
                Decide
              </Button>
              <Button type="button" variant="outline" onClick={() => setRefreshNonce((nonce) => nonce + 1)}>
                Refresh
              </Button>
            </div>
          </Card>
        ))}

        {!loading && !hasRows ? (
          <Card className={styles.emptyState}>
            <p>All caught up! Registrations will appear here as soon as new tenants submit the form.</p>
          </Card>
        ) : null}
      </div>

      {decisionState.open ? (
        <RegistrationDecisionModal
          registrationId={decisionState.registrationId}
          onConfirm={handleDecision}
          onClose={() => setDecisionState({ open: false })}
        />
      ) : null}
    </section>
  );
}
