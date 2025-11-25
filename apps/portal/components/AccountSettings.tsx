"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Button, Card, FormField, Input, Textarea } from "@nova/design-system";

export interface AccountSettingsProps {
  primaryLocationName?: string | null;
  profileDefaults: {
    firstName: string;
    lastName: string;
    title: string | null;
    email: string;
    bio?: string | null;
  };
  businessDefaults: {
    legalName: string;
    supportEmail: string;
    timezone: string;
    notes?: string | null;
  };
}

export function AccountSettings({
  businessDefaults,
  primaryLocationName,
  profileDefaults
}: AccountSettingsProps) {
  const [profileState, setProfileState] = useState(profileDefaults);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarStatus, setAvatarStatus] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState(businessDefaults.legalName);
  const [businessEmail, setBusinessEmail] = useState(businessDefaults.supportEmail ?? "");
  const [businessTimezone, setBusinessTimezone] = useState(businessDefaults.timezone);
  const [businessNotes, setBusinessNotes] = useState(
    businessDefaults.notes ??
      "Share support contacts, payout notes, and branding instructions. These sync to invoices + statements."
  );
  const [businessStatus, setBusinessStatus] = useState<string | null>(null);

  const initials = useMemo(
    () => `${profileState.firstName?.[0] ?? ""}${profileState.lastName?.[0] ?? ""}`.trim() || "U",
    [profileState.firstName, profileState.lastName]
  );

  const onProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileStatus("Saving profile...");
    try {
      const response = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          firstName: profileState.firstName,
          lastName: profileState.lastName,
          title: profileState.title,
          email: profileState.email,
          bio: profileState.bio
        })
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: "Failed to save profile." } }));
        throw new Error(error?.error?.message ?? "Failed to save profile.");
      }
      setProfileStatus("Profile updated.");
    } catch (error) {
      setProfileStatus(error instanceof Error ? error.message : "Unable to update profile.");
    }
  };

  const onAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);
    setAvatarStatus(`Ready to upload ${file.name} (${Math.round(file.size / 1024)} KB).`);
  };

  const onAvatarUpload = async () => {
    setAvatarStatus("Uploading to placeholder storage...");
    await new Promise((resolve) => setTimeout(resolve, 800));
    setAvatarStatus("Avatar staged locally. Replace mock with object storage integration next.");
  };

  const onBusinessSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusinessStatus("Saving business profile...");
    try {
      const response = await fetch("/api/account/business", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          legalName: businessName,
          supportEmail: businessEmail,
          timezone: businessTimezone,
          notes: businessNotes
        })
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: "Failed to save business profile." } }));
        throw new Error(error?.error?.message ?? "Failed to save business profile.");
      }
      setBusinessStatus("Business profile updated.");
    } catch (error) {
      setBusinessStatus(error instanceof Error ? error.message : "Unable to update business profile.");
    }
  };

  return (
    <div className="account-settings-grid">
      <Card title="Profile">
        <form className="account-settings-form" onSubmit={onProfileSubmit}>
          <FormField label="First name" required>
            <Input
              value={profileState.firstName}
              onChange={(event) =>
                setProfileState((prev) => ({ ...prev, firstName: event.target.value }))
              }
            />
          </FormField>
          <FormField label="Last name" required>
            <Input
              value={profileState.lastName}
              onChange={(event) =>
                setProfileState((prev) => ({ ...prev, lastName: event.target.value }))
              }
            />
          </FormField>
          <FormField label="Job title">
            <Input
              value={profileState.title ?? ""}
              onChange={(event) =>
                setProfileState((prev) => ({ ...prev, title: event.target.value }))
              }
            />
          </FormField>
          <FormField label="Email" required>
            <Input
              type="email"
              value={profileState.email}
              onChange={(event) =>
                setProfileState((prev) => ({ ...prev, email: event.target.value }))
              }
            />
          </FormField>
          <FormField label="Bio / signature">
            <Textarea
              rows={3}
              value={profileState.bio ?? ""}
              placeholder="Add a short summary used in onboarding emails."
              onChange={(event) =>
                setProfileState((prev) => ({ ...prev, bio: event.target.value }))
              }
            />
          </FormField>
          <div className="account-settings-form__actions">
            <Button type="submit" size="sm">
              Save profile
            </Button>
            {profileStatus ? <span className="text-muted">{profileStatus}</span> : null}
          </div>
        </form>
      </Card>

      <Card title="Profile photo">
        <div className="avatar-upload">
          <div className="avatar-upload__preview">
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt="Profile preview" />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <p className="text-muted" style={{ marginTop: "0.5rem" }}>
            Recommended size 640x640 PNG or JPG. Images stay local until the media API launches.
          </p>
          <div className="avatar-upload__controls">
            <label className="avatar-upload__button">
              Choose file
              <input type="file" accept="image/png,image/jpeg" onChange={onAvatarChange} />
            </label>
            <Button type="button" size="sm" onClick={onAvatarUpload} disabled={!avatarPreview}>
              Upload placeholder
            </Button>
          </div>
          {avatarStatus ? <p className="text-muted">{avatarStatus}</p> : null}
        </div>
      </Card>

      <Card title="Business profile">
        <form className="account-settings-form" onSubmit={onBusinessSubmit}>
          <FormField label="Business name" required>
            <Input value={businessName} onChange={(event) => setBusinessName(event.target.value)} />
          </FormField>
          <FormField label="Support email" required>
            <Input
              type="email"
              value={businessEmail}
              onChange={(event) => setBusinessEmail(event.target.value)}
            />
          </FormField>
          <FormField label="Timezone" required>
            <Input value={businessTimezone} onChange={(event) => setBusinessTimezone(event.target.value)} />
          </FormField>
          <FormField label="Notes">
            <Textarea
              rows={3}
              value={businessNotes}
              onChange={(event) => setBusinessNotes(event.target.value)}
            />
          </FormField>
          <div className="account-settings-form__actions">
            <Button type="submit" size="sm">
              Save business profile
            </Button>
            {businessStatus ? <span className="text-muted">{businessStatus}</span> : null}
          </div>
          {primaryLocationName ? (
            <p className="text-muted" style={{ marginTop: "0.5rem" }}>
              Primary location: <strong>{primaryLocationName}</strong>. Location overrides inherit these values by
              default.
            </p>
          ) : null}
        </form>
      </Card>

      <Card title="Menu & media presets">
        <div className="menu-media-panel">
          <p className="text-muted" style={{ marginTop: 0 }}>
            Drop images here to stage menu-item or promotional art. Files stay in-memory locally until the media API
            launches. Use this workflow to prep assets and document ownership before we integrate object storage.
          </p>
          <label className="menu-media-panel__dropzone">
            <input type="file" accept="image/png,image/jpeg" multiple />
            <span>Drag & drop or click to select menu imagery</span>
          </label>
          <ul className="list-reset" style={{ marginTop: "1rem" }}>
            <li>Accepted formats: PNG, JPG. Limit 5MB per asset.</li>
            <li>Future: automatic upload to S3/GCS + link to `/v1/portal/menu/items/:id/media`.</li>
            <li>Document asset usage in `docs/SAMPLE_DATA.md` for deterministic demos.</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
