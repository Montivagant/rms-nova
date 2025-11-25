"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@nova/design-system";
import { refundPaymentAction } from "@/payments/actions";
import { refundPaymentInitialState } from "@/payments/refund-state";

type RefundPaymentFormProps = {
  paymentId: string;
  currency?: string;
  remainingAmount: number;
  defaultAmount?: number;
  disabled?: boolean;
  disabledReason?: string;
};

const formatCurrencyValue = (value: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);

const SubmitButton = ({
  disabled
}: {
  disabled?: boolean;
}) => {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={disabled || pending}>
      {pending ? "Submitting..." : "Submit refund"}
    </Button>
  );
};

export const RefundPaymentForm = ({
  paymentId,
  currency = "USD",
  remainingAmount,
  defaultAmount,
  disabled,
  disabledReason
}: RefundPaymentFormProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction] = useFormState(refundPaymentAction, refundPaymentInitialState);
  const normalizedRemaining = useMemo(() => Math.max(Number(remainingAmount) || 0, 0), [remainingAmount]);
  const normalizedDefault = useMemo(() => {
    if (typeof defaultAmount === "number") {
      return Math.min(Math.max(defaultAmount, 0.01), normalizedRemaining || 0.01);
    }
    return normalizedRemaining;
  }, [defaultAmount, normalizedRemaining]);
  const [lastSuccessMessage, setLastSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === "success") {
      setIsOpen(false);
      setLastSuccessMessage(state.message ?? "Refund submitted");
    } else if (state.status === "error") {
      setLastSuccessMessage(null);
    }
  }, [state.status, state.message]);

  const showButtonOnly = !isOpen;
  const isControlDisabled = disabled || normalizedRemaining <= 0;

  return (
    <div className="portal-refund-control">
      {showButtonOnly ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={isControlDisabled}
          title={disabledReason}
          onClick={() => {
            setLastSuccessMessage(null);
            setIsOpen(true);
          }}
        >
          Issue refund
        </Button>
      ) : (
        <form action={formAction} className="portal-refund-form">
          <input type="hidden" name="paymentId" value={paymentId} />
          <label>
            Amount ({currency})
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              max={normalizedRemaining.toFixed(2)}
              defaultValue={normalizedDefault.toFixed(2)}
              required
            />
          </label>
          <label>
            Reason (optional)
            <textarea name="reason" rows={2} maxLength={256} placeholder="Customer request" />
          </label>
          <div className="portal-refund-form__actions">
            <SubmitButton disabled={normalizedRemaining <= 0} />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setIsOpen(false);
              }}
            >
              Cancel
            </Button>
          </div>
          <p className="portal-refund-form__helper">
            Remaining balance: {formatCurrencyValue(normalizedRemaining, currency)}
          </p>
          {state.status === "error" ? (
            <p className="portal-refund-form__error">{state.message}</p>
          ) : null}
          {state.status === "success" ? (
            <p className="portal-refund-form__success">{state.message ?? "Refund submitted"}</p>
          ) : null}
        </form>
      )}
      {showButtonOnly && isControlDisabled && disabledReason ? (
        <p className="portal-refund-form__helper">{disabledReason}</p>
      ) : null}
      {showButtonOnly && !isControlDisabled && lastSuccessMessage ? (
        <p className="portal-refund-form__success">{lastSuccessMessage}</p>
      ) : null}
    </div>
  );
};
