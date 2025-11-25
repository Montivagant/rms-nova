"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PortalApiError, requestJson } from "@lib/api-client";
import { getPortalAuthHeaders } from "@lib/server-auth";
import type { RefundPaymentActionState } from "./refund-state";

const refundSchema = z.object({
  paymentId: z.string().uuid(),
  amount: z.coerce.number().positive().max(1_000_000),
  reason: z
    .string()
    .optional()
    .transform((value) => value?.trim())
    .refine((value) => !value || value.length <= 256, {
      message: "Reason must be 256 characters or fewer"
    })
});

export async function refundPaymentAction(
  _prevState: RefundPaymentActionState,
  formData: FormData
): Promise<RefundPaymentActionState> {
  let payload: z.infer<typeof refundSchema>;
  try {
    payload = refundSchema.parse({
      paymentId: formData.get("paymentId"),
      amount: formData.get("amount"),
      reason: formData.get("reason")
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid refund payload";
    return { status: "error", message };
  }

  const authHeaders = await getPortalAuthHeaders();

  try {
    await requestJson({
      path: `/v1/portal/pos/payments/${payload.paymentId}/refunds`,
      method: "POST",
      headers: {
        ...authHeaders
      },
      body: JSON.stringify({
        amount: payload.amount,
        reason: payload.reason ?? undefined
      })
    });
  } catch (error) {
    if (error instanceof PortalApiError) {
      const apiMessage =
        typeof (error.details as { error?: { message?: string } })?.error?.message === "string"
          ? (error.details as { error?: { message?: string } }).error!.message!
          : `Refund failed (status ${error.status})`;
      return { status: "error", message: apiMessage };
    }
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Unknown refund error"
    };
  }

  revalidatePath("/payments");
  revalidatePath("/pos");
  revalidatePath("/reporting");
  revalidatePath("/");

  return { status: "success", message: "Refund submitted" };
}
