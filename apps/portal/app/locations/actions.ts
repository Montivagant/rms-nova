"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requestJson } from "@lib/api-client";
import { getPortalAuthHeaders } from "@lib/server-auth";

const createSchema = z.object({
  name: z.string().trim().min(2).max(64),
  code: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9-]+$/i, "Use letters, numbers, or hyphens"),
  timezone: z.string().trim().min(2).max(64).default("UTC")
});

const toggleSchema = z.object({
  locationId: z.string().uuid(),
  nextStatus: z.enum(["active", "inactive"])
});

const inventorySelectionSchema = z.object({
  locationId: z.string().uuid(),
  inventoryItemIds: z.array(z.string().uuid()).min(1)
});

const menuSelectionSchema = z.object({
  locationId: z.string().uuid(),
  menuItemIds: z.array(z.string().uuid()).min(1)
});

const revalidateLocations = () => {
  revalidatePath("/locations");
  revalidatePath("/");
};

const mutateAssignments = async (locationId: string, body: Record<string, string[]>) => {
  const authHeaders = await getPortalAuthHeaders();
  await requestJson({
    path: `/v1/portal/locations/${locationId}/assignments`,
    method: "POST",
    body: JSON.stringify(body),
    headers: authHeaders
  });
  revalidateLocations();
};

export async function createLocationAction(formData: FormData) {
  const payload = createSchema.parse({
    name: formData.get("name"),
    code: formData.get("code"),
    timezone: formData.get("timezone") || "UTC"
  });

  const authHeaders = await getPortalAuthHeaders();
  await requestJson({
    path: "/v1/portal/locations",
    method: "POST",
    body: JSON.stringify(payload),
    headers: authHeaders
  });

  revalidateLocations();
}

export async function toggleLocationStatusAction(formData: FormData) {
  const payload = toggleSchema.parse({
    locationId: formData.get("locationId"),
    nextStatus: formData.get("nextStatus")
  });

  const authHeaders = await getPortalAuthHeaders();
  await requestJson({
    path: `/v1/portal/locations/${payload.locationId}`,
    method: "PATCH",
    body: JSON.stringify({ status: payload.nextStatus }),
    headers: authHeaders
  });

  revalidateLocations();
}

export async function assignInventoryToLocationAction(formData: FormData) {
  const payload = inventorySelectionSchema.parse({
    locationId: formData.get("locationId"),
    inventoryItemIds: formData.getAll("inventoryItemIds")
  });
  await mutateAssignments(payload.locationId, { assignInventory: payload.inventoryItemIds });
}

export async function removeInventoryFromLocationAction(formData: FormData) {
  const payload = inventorySelectionSchema.parse({
    locationId: formData.get("locationId"),
    inventoryItemIds: formData.getAll("inventoryItemIds")
  });
  await mutateAssignments(payload.locationId, { removeInventory: payload.inventoryItemIds });
}

export async function assignMenuItemsToLocationAction(formData: FormData) {
  const payload = menuSelectionSchema.parse({
    locationId: formData.get("locationId"),
    menuItemIds: formData.getAll("menuItemIds")
  });
  await mutateAssignments(payload.locationId, { assignMenuItems: payload.menuItemIds });
}

export async function removeMenuItemsFromLocationAction(formData: FormData) {
  const payload = menuSelectionSchema.parse({
    locationId: formData.get("locationId"),
    menuItemIds: formData.getAll("menuItemIds")
  });
  await mutateAssignments(payload.locationId, { removeMenuItems: payload.menuItemIds });
}
