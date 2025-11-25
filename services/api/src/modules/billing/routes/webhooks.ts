import type { FastifyInstance } from "fastify";
import { billingWebhookEventSchema } from "@nova/billing";
import { pool } from "../../../db.js";
import { Errors } from "../../../errors.js";
import { enqueueBillingWebhook } from "../../../queues/billing-webhook.js";
import { billingWebhookCounter } from "../../../metrics.js";

export const registerBillingWebhookRoutes = async (app: FastifyInstance) => {
  app.post("/billing/webhooks/sandbox", async (request, reply) => {
    const secret = process.env.BILLING_WEBHOOK_SECRET;
    const signature = request.headers["x-sandbox-signature"];
    if (secret && signature !== secret) {
      throw Errors.authn("Invalid webhook signature");
    }

    const parsed = billingWebhookEventSchema.safeParse(request.body);
    if (!parsed.success) {
      throw Errors.validation("Invalid webhook payload", parsed.error.flatten().fieldErrors);
    }

    const event = parsed.data;
    const client = await pool.connect();

    try {
      const insertResult = await client.query(
        `
          INSERT INTO billing_webhook_events (event_type, payload, status)
          VALUES ($1, $2, 'pending')
          RETURNING id
        `,
        [event.type, JSON.stringify(event)]
      );

      const eventId: string | undefined = insertResult.rows[0]?.id;
      if (!eventId) {
        throw Errors.internal("Failed to persist webhook event");
      }

      try {
        await enqueueBillingWebhook({ eventId, eventType: event.type });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await client.query(
          `
            UPDATE billing_webhook_events
            SET status = 'failed',
                attempts = attempts + 1,
                processed_at = NOW(),
                last_error = $2
            WHERE id = $1
          `,
          [eventId, message]
        );
        billingWebhookCounter.inc({ status: "enqueue_failed", event_type: event.type });
        request.log.error({ err: error, eventId, eventType: event.type }, "billing.webhook.enqueue_failed");
        throw Errors.internal("Failed to queue webhook event");
      }

      return reply.status(202).send({
        data: {
          acknowledged: true,
          status: "queued",
          eventId
        }
      });
    } finally {
      client.release();
    }
  });
};
