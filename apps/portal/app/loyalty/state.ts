"use server";

export type LoyaltyActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export const loyaltyActionInitialState: LoyaltyActionState = {
  status: "idle"
};

