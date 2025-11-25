"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PortalApiError, requestJson } from "@lib/api-client";
import { getPortalAuthHeaders } from "@lib/server-auth";

const quickSaleSchema = z.object({
  menuItemId: z.string().uuid(),
  quantity: z.coerce.number().positive().max(500),
  paymentMethod: z.enum(["Card", "Cash", "Online"]),
  tipAmount: z.coerce.number().min(0).max(1000).optional(),
  locationId: z.string().uuid().optional(),
  notes: z.string().trim().max(256).optional(),
  loyaltyCustomerId: z
    .string()
    .trim()
    .min(3)
    .max(160)
    .optional()
});

const asOptionalValue = (value: FormDataEntryValue | null) => {
  if (value === null) return undefined;
  if (typeof value !== "string") return undefined;
  return value.trim().length === 0 ? undefined : value;
};

export async function recordQuickSaleAction(formData: FormData) {
  const payload = quickSaleSchema.parse({
    menuItemId: formData.get("menuItemId"),
    quantity: formData.get("quantity"),
    paymentMethod: formData.get("paymentMethod"),
    tipAmount: asOptionalValue(formData.get("tipAmount")),
    locationId: asOptionalValue(formData.get("locationId")),
    notes: asOptionalValue(formData.get("notes")),
    loyaltyCustomerId: asOptionalValue(formData.get("loyaltyCustomerId"))
  });

  const authHeaders = await getPortalAuthHeaders();
  try {
    await requestJson({
      path: "/v1/portal/pos/tickets",
      method: "POST",
      body: JSON.stringify({
        items: [{ menuItemId: payload.menuItemId, quantity: payload.quantity }],
        paymentMethod: payload.paymentMethod,
        tipAmount: payload.tipAmount ?? 0,
        locationId: payload.locationId,
        notes: payload.notes,
        loyaltyCustomerId: payload.loyaltyCustomerId
      }),
      headers: {
        "Content-Type": "application/json",
        ...authHeaders
      }
    });
  } catch (error) {
    if (error instanceof PortalApiError) {
      const fallbackMessage =
        typeof (error.details as { error?: { message?: string } })?.error?.message === "string"
          ? (error.details as { error?: { message?: string } }).error!.message!
          : `Failed to record sale (status ${error.status})`;
      throw new Error(fallbackMessage);
    }
    throw error;
  }

  revalidatePath("/pos");
  revalidatePath("/");
  revalidatePath("/payments");
  revalidatePath("/reporting");
}
