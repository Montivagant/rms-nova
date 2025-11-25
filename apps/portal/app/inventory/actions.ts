"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requestJson } from "@lib/api-client";
import type { InventoryCountSession } from "@lib/data-sources";
import { getPortalAuthHeaders } from "@lib/server-auth";

const adjustmentSchema = z
  .object({
    itemId: z.string().uuid(),
    quantityDelta: z.coerce.number(),
    reason: z.preprocess(
      (value) => {
        const normalized = typeof value === "string" ? value.trim() : "";
        if (normalized.length >= 3) return normalized;
        return "Adjustment";
      },
      z.string().min(3).max(120)
    ),
    notes: z.preprocess(
      (value) => {
        if (value === undefined || value === null) return undefined;
        const trimmed = String(value).trim();
        return trimmed.length > 0 ? trimmed : undefined;
      },
      z.string().min(1).max(256).optional()
    )
  })
  .refine((value) => Number.isFinite(value.quantityDelta) && value.quantityDelta !== 0, {
    message: "Quantity delta must be non-zero",
    path: ["quantityDelta"]
  });

export async function adjustInventoryItemAction(formData: FormData) {
  const payload = adjustmentSchema.parse({
    itemId: formData.get("itemId"),
    quantityDelta: formData.get("quantityDelta"),
    reason: formData.get("reason"),
    notes: formData.get("notes")
  });

  const authHeaders = await getPortalAuthHeaders();
  await requestJson({
    path: `/v1/portal/inventory/items/${payload.itemId}/adjustments`,
    method: "POST",
    body: JSON.stringify({
      quantityDelta: payload.quantityDelta,
      reason: payload.reason,
      notes: payload.notes
    }),
    headers: {
      "Content-Type": "application/json",
      ...authHeaders
    }
  });

  revalidatePath("/inventory");
}

const reconcileSchema = z.object({
  countName: z.string().trim().min(3).max(120),
  locationId: z.string().uuid()
});

const attachmentSchema = z.object({
  countId: z.string().uuid(),
  label: z
    .string()
    .trim()
    .max(120)
    .optional(),
  url: z.string().trim().url().max(2048)
});

export async function reconcileInventoryAction(formData: FormData) {
  const payload = reconcileSchema.parse({
    countName: formData.get("countName"),
    locationId: formData.get("locationId")
  });

  const entries: Array<{ itemId: string; countedQuantity: number }> = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("count__")) continue;
    const itemId = key.replace("count__", "");
    const countedValue = Number(value);
    if (!Number.isFinite(countedValue)) continue;
    entries.push({ itemId, countedQuantity: countedValue });
  }

  if (entries.length === 0) {
    throw new Error("Provide at least one counted quantity before submitting");
  }

  const authHeaders = await getPortalAuthHeaders();
  const headers = {
    "Content-Type": "application/json",
    ...authHeaders
  };

  const sessionResponse = await requestJson<{ data: InventoryCountSession }>({
    path: "/v1/portal/inventory/counts",
    method: "POST",
    headers,
    body: JSON.stringify({
      name: payload.countName,
      locationId: payload.locationId
    })
  });

  const sessionId = sessionResponse.data.id;

  await requestJson({
    path: `/v1/portal/inventory/counts/${sessionId}/items`,
    method: "POST",
    headers,
    body: JSON.stringify({ entries })
  });

  await requestJson({
    path: `/v1/portal/inventory/counts/${sessionId}/complete`,
    method: "POST",
    headers
  });

  revalidatePath("/inventory");
  revalidatePath("/inventory/reconcile");
}

export async function addInventoryAttachmentAction(formData: FormData) {
  const payload = attachmentSchema.parse({
    countId: formData.get("countId"),
    label: formData.get("label"),
    url: formData.get("url")
  });

  const authHeaders = await getPortalAuthHeaders();
  await requestJson({
    path: `/v1/portal/inventory/counts/${payload.countId}/attachments`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders
    },
    body: JSON.stringify({
      url: payload.url,
      label: payload.label
    })
  });

  revalidatePath("/inventory/reconcile");
}
