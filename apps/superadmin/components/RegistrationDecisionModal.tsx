"use client";

import { useState, type ChangeEvent } from "react";
import { Button, FormField, Select, Textarea } from "@nova/design-system";
import styles from "./RegistrationDecisionModal.module.css";

type Props = {
  registrationId: string;
  onConfirm(decision: "approve" | "reject", reason?: string): Promise<void>;
  onClose(): void;
};

const reasonValidationMessage = "A reason is required when rejecting a registration.";

export default function RegistrationDecisionModal({ registrationId, onConfirm, onClose }: Props) {
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasonError =
    decision === "reject" && reason.trim().length === 0 ? reasonValidationMessage : undefined;

  const handleDecisionChange = (nextValue: string) => {
    setDecision(nextValue as "approve" | "reject");
    setError(null);
  };

  const handleReasonChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setReason(event.target.value);
    if (error === reasonValidationMessage) {
      setError(null);
    }
  };

  const handleSubmit = async () => {
    if (reasonError) {
      setError(reasonValidationMessage);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await onConfirm(decision, reason.trim() || undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update registration.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.backdrop} role="presentation">
      <dialog
        className={styles.dialog}
        aria-modal="true"
        aria-labelledby="registration-decision-title"
        open
      >
        <h2 id="registration-decision-title" className={styles.title}>
          Decide on {registrationId.slice(0, 8)}
        </h2>

        <FormField
          label="Decision"
          className={styles.section}
          hint="Approvals provision modules immediately; rejections require a short note."
        >
          <Select value={decision} onChange={(event) => handleDecisionChange(event.target.value)}>
            <option value="approve">Approve</option>
            <option value="reject">Reject</option>
          </Select>
        </FormField>

        <FormField
          label="Reason"
          hint="Optional details shared with the tenant (required for rejections)."
          error={reasonError}
          className={`${styles.section} ${styles.formField}`}
        >
          <Textarea
            value={reason}
            onChange={handleReasonChange}
            placeholder="Add a short note for the tenant."
            rows={4}
            error={Boolean(reasonError)}
          />
        </FormField>

        {error && !reasonError ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.actions}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className={decision === "reject" ? styles.dangerButton : undefined}
          >
            {submitting ? "Submitting..." : decision === "reject" ? "Reject" : "Approve"}
          </Button>
        </div>
      </dialog>
    </div>
  );
}
