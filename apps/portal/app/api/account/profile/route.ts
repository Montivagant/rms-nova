import { NextResponse } from "next/server";
import { z } from "zod";
import { PortalApiError, requestJson } from "@lib/api-client";
import { getPortalAuthHeaders } from "@lib/server-auth";
import type { AccountProfile } from "@lib/data-sources";

const profileUpdateSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  title: z.string().trim().max(120).optional().nullable(),
  email: z.string().trim().email(),
  bio: z.string().trim().max(512).optional().nullable()
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
    const payload = await requestJson<{ data: AccountProfile }>({
      path: "/v1/portal/account/profile",
      headers: authHeaders
    });
    return NextResponse.json(payload);
  } catch (error) {
    return handlePortalError(error, "Unable to load account profile.");
  }
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { message: "Invalid profile payload." } }, { status: 400 });
  }

  try {
    const authHeaders = await getPortalAuthHeaders();
    const payload = await requestJson<{ data: AccountProfile }>({
      path: "/v1/portal/account/profile",
      method: "PATCH",
      body: JSON.stringify(parsed.data),
      headers: {
        "Content-Type": "application/json",
        ...authHeaders
      }
    });
    return NextResponse.json(payload);
  } catch (error) {
    return handlePortalError(error, "Unable to update profile.");
  }
}
