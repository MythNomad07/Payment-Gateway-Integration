// server/src/webhook.js
const Stripe = require("stripe");
const pool = require("./db");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  console.log("📩 Incoming webhook hit!");

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      // ✅ Payment succeeded
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        const txnId = pi.metadata?.txn_id;
        console.log("✅ Payment succeeded:", pi.id, "txn_id:", txnId);

        await pool.query(
          `UPDATE transactions
           SET status=$1, updated_at=NOW()
           WHERE ${txnId ? "txn_id" : "payment_intent_id"}=$2`,
          ["succeeded", txnId || pi.id]
        );
        break;
      }

      // ❌ Payment failed (PI-level)
      case "payment_intent.payment_failed":
      case "payment_intent.canceled": {
        const pi = event.data.object;
        const txnId = pi.metadata?.txn_id;
        console.log("❌ Payment failed/canceled:", pi.id, "txn_id:", txnId);

        await pool.query(
          `UPDATE transactions
           SET status=$1, updated_at=NOW(), metadata = metadata || $3::jsonb
           WHERE ${txnId ? "txn_id" : "payment_intent_id"}=$2`,
          [
            "failed",
            txnId || pi.id,
            JSON.stringify({ failure_reason: pi.last_payment_error?.message || "unknown" }),
          ]
        );
        break;
      }

      // ❌ Charge failed (sometimes fired instead of PI failed)
      case "charge.failed": {
        const charge = event.data.object;
        const paymentIntentId = charge.payment_intent;
        console.log("❌ Charge failed for:", paymentIntentId);

        if (paymentIntentId) {
          await pool.query(
            `UPDATE transactions
             SET status=$1, updated_at=NOW(), metadata = metadata || $3::jsonb
             WHERE payment_intent_id=$2`,
            [
              "failed",
              paymentIntentId,
              JSON.stringify({ failure_reason: charge.failure_message || "charge_failed" }),
            ]
          );
        }
        break;
      }

      // ↩️ Refunds
      case "charge.refunded":
      case "refund.created":
      case "refund.updated": {
        const obj = event.data.object;
        const paymentIntentId = obj.payment_intent;
        console.log("↩️ Refund processed for:", paymentIntentId);

        if (paymentIntentId) {
          await pool.query(
            `UPDATE transactions
             SET status=$1, updated_at=NOW()
             WHERE payment_intent_id=$2`,
            ["refunded", paymentIntentId]
          );
        }
        break;
      }

      default:
        console.debug(`ℹ️ Unhandled event type ${event.type}`);
    }
  } catch (err) {
    console.error("❌ DB update error:", err);
  }

  res.json({ received: true });
};
