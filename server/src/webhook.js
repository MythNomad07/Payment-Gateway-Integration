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

      // ❌ Payment failed
      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        const txnId = pi.metadata?.txn_id;
        console.log("❌ Payment failed:", pi.id, "txn_id:", txnId);

        await pool.query(
          `UPDATE transactions 
           SET status=$1, updated_at=NOW() 
           WHERE ${txnId ? "txn_id" : "payment_intent_id"}=$2`,
          ["failed", txnId || pi.id]
        );
        break;
      }

      // ↩️ Refund events
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

      // ℹ️ Ignore others
      default:
        console.debug(`ℹ️ Unhandled event type ${event.type}`);
    }
  } catch (err) {
    console.error("❌ DB update error:", err);
  }

  // Always respond quickly
  res.json({ received: true });
};
