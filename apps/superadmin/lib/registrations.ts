"use client";

import { getSuperadminToken } from "@lib/auth";
import type { RegistrationModuleDefault } from "@nova/module-registry/defaults";

export type RegistrationStatus = "pending" | "approved" | "rejected";

export type RegistrationModuleToggle = RegistrationModuleDefault;

export type Registration = {
  id: string;
  status: RegistrationStatus;
  tenantId?: string | null;
  modules?: RegistrationModuleToggle[];
  business: {
    legalName: string;
    contactEmail: string;
    contactPhone?: string;
  };
  owner: {
    firstName: string;
    lastName: string;
    email: string;
  };
  createdAt?: string;
  decidedAt?: string | null;
  reason?: string | null;
};

const getClientBaseUrl = () =>
  typeof window === "undefined"
    ? process.env.API_BASE_URL ?? "http://localhost:3001"
    : "";

export async function listRegistrations(status: RegistrationStatus) {
  const baseUrl = getClientBaseUrl();

  const token = await getSuperadminToken();
  const response = await fetch(
    `${baseUrl}/v1/superadmin/registrations?status=${status}`,
    {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      credentials: "include",
      cache: "no-store"
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw Object.assign(new Error("Failed to fetch registrations"), {
      response,
      payload: error
    });
  }

  return (await response.json()) as { data: Registration[] };
}

export async function decideRegistration(
  id: string,
  decision: "approve" | "reject",
  reason?: string,
  modules?: RegistrationModuleToggle[]
) {
  const baseUrl = getClientBaseUrl();

  const token = await getSuperadminToken();
  const payload: Record<string, unknown> = { decision };
  if (typeof reason === "string" && reason.length > 0) {
    payload.reason = reason;
  }
  if (Array.isArray(modules) && modules.length > 0) {
    payload.modules = modules;
  }

  const response = await fetch(`${baseUrl}/v1/superadmin/registrations/${id}/decision`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    credentials: "include",
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw Object.assign(new Error("Failed to update registration"), {
      response,
      payload: error
    });
  }

  return response.json();
}

export async function updateRegistrationModules(id: string, modules: RegistrationModuleToggle[]) {
  const baseUrl = getClientBaseUrl();

  const token = await getSuperadminToken();
  const response = await fetch(`${baseUrl}/v1/superadmin/registrations/${id}/modules`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    credentials: "include",
    body: JSON.stringify({ modules })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw Object.assign(new Error("Failed to update module toggles"), {
      response,
      payload: error
    });
  }

  return response.json() as Promise<{ data: { modules: RegistrationModuleToggle[] } }>;
}

