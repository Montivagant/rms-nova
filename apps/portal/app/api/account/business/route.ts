import { NextResponse } from "next/server";
import { z } from "zod";
import { PortalApiError, requestJson } from "@lib/api-client";
import { getPortalAuthHeaders } from "@lib/server-auth";
import type { BusinessProfile } from "@lib/data-sources";

const businessSchema = z.object({
  legalName: z.string().trim().min(2).max(160),
  supportEmail: z.string().trim().email().optional().nullable(),
  timezone: z.string().trim().min(2).max(64),
  notes: z.string().trim().max(512).optional().nullable()
});

const handlePortalError = (error: unknown, fallbackMessage: string) => {
  if (error instanceof PortalApiError) {
    return NextResponse.json(error.details ?? { error: { message: fallbackMessage } }, {
      status: error.status
    });
  }
  return NextResponse.json({ error: { message: fallbackMessage } }, { status: 500 });
};

export async function GET() {
  try {
    const authHeaders = await getPortalAuthHeaders();
    const payload = await requestJson<{ data: BusinessProfile }>({
      path: "/v1/portal/account/business",
      headers: authHeaders
    });
    return NextResponse.json(payload);
  } catch (error) {
    return handlePortalError(error, "Unable to load business profile.");
  }
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = businessSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { message: "Invalid business profile payload." } }, { status: 400 });
  }

  try {
    const authHeaders = await getPortalAuthHeaders();
    const payload = await requestJson<{ data: BusinessProfile }>({
      path: "/v1/portal/account/business",
      method: "PATCH",
      body: JSON.stringify(parsed.data),
      headers: {
        "Content-Type": "application/json",
        ...authHeaders
      }
    });
    return NextResponse.json(payload);
  } catch (error) {
    return handlePortalError(error, "Unable to update business profile.");
  }
}
