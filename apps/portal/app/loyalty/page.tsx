import { Card } from "@nova/design-system";
import {
  getLoyaltyAccountDetail,
  getLoyaltyOverview,
  getPortalContext
} from "@lib/data-sources";
import { ensureModuleEnabled } from "@lib/module-guards";
import { hasPermission, formatPermissionRequirement } from "@lib/capabilities";
import { LoyaltyForms } from "@components/LoyaltyForms";

type LoyaltyPageProps = {
  searchParams?: {
    accountId?: string;
  };
};

const formatPoints = (value: number) => new Intl.NumberFormat("en-US").format(value);

const formatDate = (value?: string | null) => {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric"
  });
};

export default async function LoyaltyPage({ searchParams }: LoyaltyPageProps) {
  const context = await getPortalContext();
  ensureModuleEnabled(context, "loyalty");
  const overview = await getLoyaltyOverview();
  const requestedAccountId = searchParams?.accountId;
  const selectedAccount =
    overview.accounts.find((account) => account.id === requestedAccountId) ?? overview.accounts[0] ?? null;
  const detail = selectedAccount ? await getLoyaltyAccountDetail(selectedAccount.id) : null;
  const canEarn = hasPermission(context, ["loyalty.transactions.earn"]);
  const canRedeem = hasPermission(context, ["loyalty.transactions.redeem"]);
  const earnRequirement = formatPermissionRequirement("loyalty.transactions.earn");
  const redeemRequirement = formatPermissionRequirement("loyalty.transactions.redeem");

  return (
    <div className="portal-page">
      <div className="portal-page__header">
        <div>
          <h2>Loyalty</h2>
          <p className="text-muted">
            Monitor loyalty balances, view account activity, and grant/redeem points for tenants in staging/local
            environments.
          </p>
        </div>
      </div>

      <Card title="Program overview">
        <div className="portal-grid portal-grid--metrics">
          <div className="metric-card">
            <div className="metric-card__label">Total accounts</div>
            <div className="metric-card__value">{formatPoints(overview.stats.totalAccounts)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-card__label">Active accounts</div>
            <div className="metric-card__value">{formatPoints(overview.stats.activeAccounts)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-card__label">Points outstanding</div>
            <div className="metric-card__value">{formatPoints(overview.stats.totalPoints)} pts</div>
          </div>
          <div className="metric-card">
            <div className="metric-card__label">Earn rate</div>
            <div className="metric-card__value">{overview.rules.earnRate} pt / $1</div>
            <div className="metric-card__helper">Redeem {overview.rules.redeemRate * 100}% of spend</div>
          </div>
        </div>
      </Card>

      <Card title="Accounts">
        {overview.accounts.length === 0 ? (
          <p className="text-muted">
            No loyalty accounts detected yet. Run a POS sale after seeding to mint deterministic accounts.
          </p>
        ) : (
          <table className="portal-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Balance</th>
                <th>Pending</th>
                <th>Status</th>
                <th>Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {overview.accounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.externalCustomerId ?? account.id}</td>
                  <td>{formatPoints(account.balance)} pts</td>
                  <td>{formatPoints(account.pendingBalance)} pts</td>
                  <td>
                    <span className={`badge ${account.status === "active" ? "badge--success" : "badge--warning"}`}>
                      {account.status}
                    </span>
                  </td>
                  <td>{account.expiresAt ? formatDate(account.expiresAt) : "None"}</td>
                  <td>
                    <a
                      className="link"
                      href={`/loyalty?accountId=${encodeURIComponent(account.id)}`}
                      title="View account detail"
                    >
                      View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Account detail">
        {detail ? (
          <div className="loyalty-detail">
            <div className="loyalty-detail__summary">
              <div>
                <strong>{detail.account.externalCustomerId ?? detail.account.id}</strong>
                <p className="text-muted">
                  Balance {formatPoints(detail.account.balance)} pts • Updated {formatDate(detail.account.updatedAt)}
                </p>
              </div>
              <div>
                <span className={`badge ${detail.account.status === "active" ? "badge--success" : "badge--warning"}`}>
                  {detail.account.status}
                </span>
              </div>
            </div>
            {detail.transactions.length === 0 ? (
              <p className="text-muted">No transactions recorded yet.</p>
            ) : (
              <table className="portal-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Points</th>
                    <th>Balance after</th>
                    <th>Reference</th>
                    <th>Source</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.transactions.map((txn) => (
                    <tr key={txn.id}>
                      <td>{txn.type}</td>
                      <td>{formatPoints(txn.points)}</td>
                      <td>{formatPoints(txn.balanceAfter)} pts</td>
                      <td>{txn.reference ?? "—"}</td>
                      <td>{txn.source ?? "—"}</td>
                      <td>{formatDate(txn.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <p className="text-muted">Select an account to view transaction history.</p>
        )}
      </Card>

      <Card title="Manage points">
        <LoyaltyForms
          accounts={overview.accounts}
          canEarn={canEarn}
          canRedeem={canRedeem}
          selectedAccountId={selectedAccount?.id}
          earnDisabledReason={canEarn ? undefined : `Requires ${earnRequirement}`}
          redeemDisabledReason={canRedeem ? undefined : `Requires ${redeemRequirement}`}
        />
      </Card>
    </div>
  );
}

