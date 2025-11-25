export type RefundPaymentActionState =
  | { status: "idle"; message?: string }
  | { status: "success"; message?: string }
  | { status: "error"; message: string };

export const refundPaymentInitialState: RefundPaymentActionState = { status: "idle" };
