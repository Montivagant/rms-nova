"use client";

import { useMemo } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@nova/design-system";
import type { LoyaltyAccount } from "@lib/data-sources";
import { earnPointsAction, redeemPointsAction } from "@/loyalty/actions";
import { loyaltyActionInitialState } from "@/loyalty/state";

type LoyaltyFormsProps = {
  accounts: LoyaltyAccount[];
  canEarn: boolean;
  canRedeem: boolean;
  selectedAccountId?: string | null;
  earnDisabledReason?: string;
  redeemDisabledReason?: string;
};

const FormSubmitButton = ({ label, disabled }: { label: string; disabled?: boolean }) => {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? "Submitting..." : label}
    </Button>
  );
};

export function LoyaltyForms({
  accounts,
  canEarn,
  canRedeem,
  selectedAccountId,
  earnDisabledReason,
  redeemDisabledReason
}: LoyaltyFormsProps) {
  const [earnState, earnAction] = useFormState(earnPointsAction, loyaltyActionInitialState);
  const [redeemState, redeemAction] = useFormState(redeemPointsAction, loyaltyActionInitialState);
  const hasAccounts = accounts.length > 0;
  const activeAccountId = useMemo(() => {
    if (!selectedAccountId) return accounts[0]?.id;
    return accounts.find((account) => account.id === selectedAccountId)?.id ?? accounts[0]?.id;
  }, [accounts, selectedAccountId]);

  return (
    <div className="loyalty-grid">
      <div className="loyalty-card">
        <h3>Earn points</h3>
        <p className="text-muted">Grant loyalty points for a specific customer or ticket.</p>
        {!canEarn ? (
          <p className="text-muted">{earnDisabledReason ?? "Requires loyalty.transactions.earn"}</p>
        ) : null}
        <form action={earnAction} className="loyalty-form">
          <label>
            Customer email or ID
            <input
              type="text"
              name="externalCustomerId"
              required
              placeholder="avery@example.com"
              disabled={!canEarn}
            />
          </label>
          <div className="loyalty-form__grid">
            <label>
              Points
              <input type="number" name="points" min="1" placeholder="50" disabled={!canEarn} />
            </label>
            <label>
              Amount (USD)
              <input
                type="number"
                name="amount"
                min="0.01"
                step="0.01"
                placeholder="25.00"
                disabled={!canEarn}
              />
            </label>
          </div>
          <label>
            Reference (optional)
            <input type="text" name="reference" maxLength={120} placeholder="Order #123" disabled={!canEarn} />
          </label>
          <label>
            Source (optional)
            <input type="text" name="source" maxLength={64} placeholder="pos" disabled={!canEarn} />
          </label>
          <FormSubmitButton label="Add points" disabled={!canEarn} />
          {earnState.status === "error" ? (
            <p className="loyalty-form__error">{earnState.message}</p>
          ) : null}
          {earnState.status === "success" ? (
            <p className="loyalty-form__success">{earnState.message ?? "Points earned"}</p>
          ) : null}
        </form>
      </div>

      <div className="loyalty-card">
        <h3>Redeem points</h3>
        <p className="text-muted">
          Deduct points from an account for discounts, refunds, or manual adjustments.
        </p>
        {!canRedeem ? (
          <p className="text-muted">{redeemDisabledReason ?? "Requires loyalty.transactions.redeem"}</p>
        ) : null}
        <form action={redeemAction} className="loyalty-form">
          <label>
            Account
            <select name="accountId" defaultValue={activeAccountId ?? ""} disabled={!canRedeem || !hasAccounts}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.externalCustomerId ?? account.id} ({account.balance} pts)
                </option>
              ))}
            </select>
          </label>
          <label>
            Points
            <input type="number" name="points" min="1" placeholder="25" required disabled={!canRedeem || !hasAccounts} />
          </label>
          <label>
            Reference (optional)
            <input type="text" name="reference" maxLength={120} placeholder="Ticket #123" disabled={!canRedeem} />
          </label>
          <label>
            Source (optional)
            <input type="text" name="source" maxLength={64} placeholder="pos" disabled={!canRedeem} />
          </label>
          <FormSubmitButton label="Redeem points" disabled={!canRedeem || !hasAccounts} />
          {!hasAccounts ? (
            <p className="text-muted loyalty-form__helper">
              Seed data or create a loyalty account before redeeming points.
            </p>
          ) : null}
          {redeemState.status === "error" ? (
            <p className="loyalty-form__error">{redeemState.message}</p>
          ) : null}
          {redeemState.status === "success" ? (
            <p className="loyalty-form__success">{redeemState.message ?? "Redemption submitted"}</p>
          ) : null}
        </form>
      </div>
    </div>
  );
}

