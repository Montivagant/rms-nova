"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PortalApiError, requestJson } from "@lib/api-client";
import { getPortalAuthHeaders } from "@lib/server-auth";
import type { LoyaltyActionState } from "./state";
import { loyaltyActionInitialState } from "./state";

const toOptionalNumber = (value: FormDataEntryValue | null) => {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const earnSchema = z
  .object({
    externalCustomerId: z.string().trim().min(3).max(160),
    points: z
      .number()
      .int()
      .min(1)
      .optional(),
    amount: z
      .number()
      .min(0.01)
      .optional(),
    reference: z
      .string()
      .optional()
      .transform((value) => value?.trim())
      .refine((value) => !value || value.length <= 120, "Reference must be 120 characters or fewer"),
    source: z
      .string()
      .optional()
      .transform((value) => value?.trim())
      .refine((value) => !value || value.length <= 64, "Source must be 64 characters or fewer")
  })
  .refine((value) => value.points !== undefined || value.amount !== undefined, {
    message: "Provide points or amount"
  });

const redeemSchema = z
  .object({
    accountId: z
      .string()
      .uuid()
      .optional(),
    externalCustomerId: z
      .string()
      .trim()
      .max(160)
      .optional()
      .transform((value) => (value ? value : undefined)),
    points: z
      .number()
      .int()
      .min(1),
    reference: z
      .string()
      .optional()
      .transform((value) => value?.trim())
      .refine((value) => !value || value.length <= 120, "Reference must be 120 characters or fewer"),
    source: z
      .string()
      .optional()
      .transform((value) => value?.trim())
      .refine((value) => !value || value.length <= 64, "Source must be 64 characters or fewer")
  })
  .refine((value) => Boolean(value.accountId || value.externalCustomerId), {
    message: "Provide an account or customer"
  });

const handleActionError = (error: unknown): LoyaltyActionState => {
  if (error instanceof PortalApiError) {
    const apiMessage =
      typeof (error.details as { error?: { message?: string } })?.error?.message === "string"
        ? (error.details as { error?: { message?: string } }).error!.message!
        : `Request failed (${error.status})`;
    return { status: "error", message: apiMessage };
  }
  return {
    status: "error",
    message: error instanceof Error ? error.message : "Unexpected loyalty error"
  };
};

export async function earnPointsAction(
  _prevState: LoyaltyActionState = loyaltyActionInitialState,
  formData: FormData
): Promise<LoyaltyActionState> {
  let payload: z.infer<typeof earnSchema>;
  try {
    payload = earnSchema.parse({
      externalCustomerId: formData.get("externalCustomerId"),
      points: toOptionalNumber(formData.get("points")),
      amount: toOptionalNumber(formData.get("amount")),
      reference: formData.get("reference"),
      source: formData.get("source")
    });
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Invalid earn payload"
    };
  }

  const authHeaders = await getPortalAuthHeaders();
  try {
    await requestJson({
      path: "/v1/portal/loyalty/earn",
      method: "POST",
      headers: {
        ...authHeaders
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    return handleActionError(error);
  }

  revalidatePath("/loyalty");
  revalidatePath("/");
  return { status: "success", message: "Points earned" };
}

export async function redeemPointsAction(
  _prevState: LoyaltyActionState = loyaltyActionInitialState,
  formData: FormData
): Promise<LoyaltyActionState> {
  let payload: z.infer<typeof redeemSchema>;
  try {
    payload = redeemSchema.parse({
      accountId: formData.get("accountId"),
      externalCustomerId: formData.get("externalCustomerId"),
      points: Number(formData.get("points")),
      reference: formData.get("reference"),
      source: formData.get("source")
    });
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Invalid redeem payload"
    };
  }

  const authHeaders = await getPortalAuthHeaders();
  try {
    await requestJson({
      path: "/v1/portal/loyalty/redeem",
      method: "POST",
      headers: {
        ...authHeaders
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    return handleActionError(error);
  }

  revalidatePath("/loyalty");
  revalidatePath("/");
  return { status: "success", message: "Redemption submitted" };
}

