const Stripe = require("stripe");
const pool = require("./db");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  // debug to show the webhook is reached
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

  // Handle events you care about
  try {
    // Payment intent succeeded
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object;
      console.log("✅ Payment succeeded:", pi.id);

      await pool.query(
        "UPDATE transactions SET status=$1, updated_at=NOW() WHERE payment_intent_id=$2",
        ["succeeded", pi.id]
      );

    // Payment intent failed
    } else if (event.type === "payment_intent.payment_failed") {
      const pi = event.data.object;
      console.log("❌ Payment failed:", pi.id);

      await pool.query(
        "UPDATE transactions SET status=$1, updated_at=NOW() WHERE payment_intent_id=$2",
        ["failed", pi.id]
      );

    // Charge refunded (most common refund event for our flow)
    } else if (event.type === "charge.refunded" || event.type === "refund.created" || event.type === "refund.updated") {
      // charge.refunded: event.data.object is a Charge object, with payment_intent ref
      const obj = event.data.object;
      const paymentIntentId = obj.payment_intent || obj.payment_intent_id || obj.payment_intent; // defensive
      console.log("↩️ Refund/Charge refunded for:", paymentIntentId);

      if (paymentIntentId) {
        await pool.query(
          "UPDATE transactions SET status=$1, updated_at=NOW() WHERE payment_intent_id=$2",
          ["refunded", paymentIntentId]
        );
      }
    } else {
      // keep this quiet in production; useful while developing
      console.debug(`ℹ️ Unhandled event type ${event.type}`);
    }
  } catch (err) {
    console.error("DB update error:", err);
  }

  res.json({ received: true });
};
