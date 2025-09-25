// server/src/webhook.js
const Stripe = require("stripe");
const pool = require("./db");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  console.log("📩 Incoming webhook hit!");

  const sig = req.headers["stripe-signature"];
  let event;

  // 🔹 Verify Stripe signature
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
      // ✅ Payment Succeeded
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        console.log("✅ Payment succeeded:", pi.id);

        await pool.query(
          `INSERT INTO transactions (txn_id, payment_intent_id, amount, currency, status, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (payment_intent_id)
           DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
          [
            pi.id,
            pi.id,
            pi.amount.toString(),
            pi.currency,
            "succeeded",
            JSON.stringify(pi.metadata || {})
          ]
        );
        break;
      }

      // ❌ Payment Failed
      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        console.log("❌ Payment failed:", pi.id);

        await pool.query(
          `INSERT INTO transactions (txn_id, payment_intent_id, amount, currency, status, metadata)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (payment_intent_id)
           DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
          [
            pi.id,
            pi.id,
            pi.amount.toString(),
            pi.currency,
            "failed",
            JSON.stringify(pi.metadata || {})
          ]
        );
        break;
      }

      // ↩️ Refund Events
      case "charge.refunded":
      case "refund.created":
      case "refund.updated": {
        const obj = event.data.object;
        const paymentIntentId = obj.payment_intent || obj.payment_intent_id;

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

      // ℹ️ Catch-all for unhandled events
      default:
        console.debug(`ℹ️ Unhandled event type ${event.type}`);
    }
  } catch (err) {
    console.error("❌ DB update error:", err);
  }

  // Always respond to Stripe quickly
  res.json({ received: true });
};
