"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requestJson } from "@lib/api-client";
import { getPortalAuthHeaders } from "@lib/server-auth";

const toggleSchema = z.object({
  itemId: z.string().uuid(),
  nextStatus: z.enum(["active", "inactive"])
});

const optionalString = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const optionalNumber = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const editSchema = z
  .object({
    itemId: z.string().uuid(),
    name: z.string().trim().min(2).max(80).optional(),
    description: z
      .string()
      .trim()
      .max(256)
      .optional(),
    taxRate: z.number().min(0).max(50).optional(),
    price: z.number().min(0.01).max(100000).optional(),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((value) => value.toUpperCase())
      .optional(),
    locationId: z.string().uuid().optional()
  })
  .refine(
    (value) =>
      Boolean(value.name) ||
      value.description !== undefined ||
      value.taxRate !== undefined ||
      value.price !== undefined ||
      value.currency !== undefined,
    { message: "Provide at least one field to update" }
  );

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(256).optional(),
  categoryName: z.string().trim().min(2).max(64).optional(),
  price: z.coerce.number().min(0.01).max(100000),
  taxRate: z.coerce.number().min(0).max(50).default(0),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .optional(),
  locationId: z.string().uuid().optional()
});

export async function toggleMenuItemStatusAction(formData: FormData) {
  const payload = toggleSchema.parse({
    itemId: formData.get("itemId"),
    nextStatus: formData.get("nextStatus")
  });

  const authHeaders = await getPortalAuthHeaders();
  await requestJson({
    path: `/v1/portal/menu/items/${payload.itemId}/status`,
    method: "PATCH",
    body: JSON.stringify({ status: payload.nextStatus }),
    headers: {
      "Content-Type": "application/json",
      ...authHeaders
    }
  });

  revalidatePath("/menu");
}

export async function editMenuItemAction(formData: FormData) {
  const payload = editSchema.parse({
    itemId: formData.get("itemId"),
    name: optionalString(formData.get("name")),
    description: optionalString(formData.get("description")),
    price: optionalNumber(formData.get("price")),
    taxRate: optionalNumber(formData.get("taxRate")),
    currency: optionalString(formData.get("currency")),
    locationId: optionalString(formData.get("locationId"))
  });

  const { itemId, ...updates } = payload;

  const authHeaders = await getPortalAuthHeaders();
  await requestJson({
    path: `/v1/portal/menu/items/${itemId}`,
    method: "PATCH",
    body: JSON.stringify(updates),
    headers: {
      "Content-Type": "application/json",
      ...authHeaders
    }
  });

  revalidatePath("/menu");
  revalidatePath("/");
}

export async function createMenuItemAction(formData: FormData) {
  const payload = createSchema.parse({
    name: formData.get("name"),
    description: optionalString(formData.get("description")),
    categoryName: optionalString(formData.get("categoryName")),
    price: formData.get("price"),
    taxRate: formData.get("taxRate"),
    currency: optionalString(formData.get("currency")),
    locationId: optionalString(formData.get("locationId"))
  });

  const authHeaders = await getPortalAuthHeaders();
  await requestJson({
    path: "/v1/portal/menu/items",
    method: "POST",
    body: JSON.stringify(payload),
    headers: {
      "Content-Type": "application/json",
      ...authHeaders
    }
  });

  revalidatePath("/menu");
  revalidatePath("/");
}

export async function updateMenuItemModifiersAction(formData: FormData) {
  const itemId = z.string().uuid().parse(formData.get("itemId"));
  const modifierIds = formData
    .getAll("modifierIds")
    .map((value) => value?.toString())
    .filter((value): value is string => Boolean(value));

  const authHeaders = await getPortalAuthHeaders();
  await requestJson({
    path: `/v1/portal/menu/items/${itemId}/modifiers`,
    method: "POST",
    body: JSON.stringify({ modifierIds }),
    headers: {
      "Content-Type": "application/json",
      ...authHeaders
    }
  });

  revalidatePath("/menu");
}

export async function createMenuModifierAction(formData: FormData) {
  const schema = z.object({
    name: z.string().trim().min(2).max(80),
    priceDelta: z.coerce.number().min(-1000).max(1000).default(0),
    maxSelect: z
      .union([z.coerce.number().int().min(0), z.literal(""), z.null(), z.undefined()])
      .optional()
  });

  const payload = schema.parse({
    name: formData.get("name"),
    priceDelta: formData.get("priceDelta"),
    maxSelect: formData.get("maxSelect")
  });

  const authHeaders = await getPortalAuthHeaders();
  await requestJson({
    path: "/v1/portal/menu/modifiers",
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      priceDelta: payload.priceDelta,
      maxSelect: payload.maxSelect === "" ? undefined : payload.maxSelect
    }),
    headers: {
      "Content-Type": "application/json",
      ...authHeaders
    }
  });

  revalidatePath("/menu");
}
