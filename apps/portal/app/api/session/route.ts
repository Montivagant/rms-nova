import { NextResponse } from "next/server";
import { z } from "zod";
import { PortalApiError, requestJson } from "@lib/api-client";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const buildCookieOptions = (seconds: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: seconds,
  path: "/"
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: "Invalid credentials payload" } },
      { status: 400 }
    );
  }

  try {
    const payload = await requestJson<{
      data: {
        user: unknown;
        tokens: {
          accessToken: string;
          expiresAt?: { accessToken: number };
        };
      };
    }>({
      path: "/v1/auth/login",
      method: "POST",
      body: JSON.stringify(parsed.data)
    });

    const response = NextResponse.json({ data: payload.data.user });
    const expiresAtSeconds =
      (payload.data.tokens.expiresAt?.accessToken ?? Math.floor(Date.now() / 1000) + 900) -
      Math.floor(Date.now() / 1000);
    response.cookies.set(
      "portal_access_token",
      payload.data.tokens.accessToken,
      buildCookieOptions(expiresAtSeconds)
    );
    return response;
  } catch (error: unknown) {
    if (error instanceof PortalApiError) {
      return NextResponse.json(error.details ?? { error: { message: "Login failed" } }, {
        status: error.status
      });
    }
    return NextResponse.json({ error: { message: "Unexpected error" } }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ data: true });
  response.cookies.set("portal_access_token", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/"
  });
  return response;
}
