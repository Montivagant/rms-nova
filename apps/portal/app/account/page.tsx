import { Card } from "@nova/design-system";
import { AccountSettings } from "@components/AccountSettings";
import {
  getPortalContext,
  getLocationSummaries,
  getAccountProfile,
  getBusinessProfile
} from "@lib/data-sources";

export default async function AccountPage() {
  const [context, locations, accountProfile, businessProfile] = await Promise.all([
    getPortalContext(),
    getLocationSummaries(),
    getAccountProfile(),
    getBusinessProfile()
  ]);
  const managedLocations = locations.filter((location) => location.managed);
  const primaryLocation = managedLocations.find((location) => location.isPrimary) ?? managedLocations[0] ?? null;
  const supportEmail =
    businessProfile.supportEmail ??
    (context.tenant?.alias ? `${context.tenant.alias}@example.com` : "support@example.com");

  return (
    <div className="portal-page">
      <div className="portal-page__header">
        <div>
          <h2>Account & Profile</h2>
          <p className="text-muted">
            Manage operator details, stage brand assets, and document business metadata before the real account APIs go
            live.
          </p>
        </div>
      </div>

      <AccountSettings
        profileDefaults={accountProfile}
        businessDefaults={{
          legalName: businessProfile.legalName,
          supportEmail,
          timezone: businessProfile.timezone ?? primaryLocation?.timezone ?? "America/Los_Angeles",
          notes:
            businessProfile.notes ??
            "Share support contacts, payout notes, and branding instructions. These sync to invoices + statements."
        }}
        primaryLocationName={primaryLocation?.name}
      />

      <Card title="Managed locations">
        {managedLocations.length === 0 ? (
          <p className="text-muted" style={{ margin: 0 }}>
            No managed locations yet. Use the Locations workspace to register at least one active site.
          </p>
        ) : (
          <table className="portal-table">
            <thead>
              <tr>
                <th>Location</th>
                <th>Code</th>
                <th>Timezone</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {managedLocations.map((location) => (
                <tr key={location.id}>
                  <td>
                    {location.name}
                    {location.isPrimary ? (
                      <span className="badge badge--info" style={{ marginLeft: "0.5rem" }}>
                        Primary
                      </span>
                    ) : null}
                  </td>
                  <td>{location.code}</td>
                  <td>{location.timezone}</td>
                  <td>{location.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
