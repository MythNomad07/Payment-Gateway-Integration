// server/src/webhook.js
const Stripe = require("stripe");
const pool = require("./db");
const nodemailer = require("nodemailer");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// ✅ Configure Gmail SMTP (set these in Render env vars)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER, // your Gmail address
    pass: process.env.EMAIL_PASS, // app password (not your Gmail password!)
  },
});

// 🔹 Helper: send email
async function sendEmail(to, subject, text) {
  try {
    await transporter.sendMail({
      from: `"Payments Demo" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
    });
    console.log("📧 Email sent to:", to);
  } catch (err) {
    console.error("❌ Email send failed:", err);
  }
}

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
        const email = pi.receipt_email || process.env.DEMO_RECEIVER; // fallback for demo
        console.log("✅ Payment succeeded:", pi.id, "txn_id:", txnId);

        await pool.query(
          `UPDATE transactions
           SET status=$1, updated_at=NOW()
           WHERE ${txnId ? "txn_id" : "payment_intent_id"}=$2`,
          ["succeeded", txnId || pi.id]
        );

        if (email) {
          await sendEmail(
            email,
            "✅ Payment Successful",
            `Your payment of ${(pi.amount / 100).toFixed(2)} ${pi.currency.toUpperCase()} was successful.`
          );
        }
        break;
      }

      // ❌ Payment failed
      case "payment_intent.payment_failed":
      case "payment_intent.canceled": {
        const pi = event.data.object;
        const txnId = pi.metadata?.txn_id;
        const email = pi.receipt_email || process.env.DEMO_RECEIVER;
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

        if (email) {
          await sendEmail(
            email,
            "❌ Payment Failed",
            `Your payment attempt for ${(pi.amount / 100).toFixed(2)} ${pi.currency.toUpperCase()} failed.\nReason: ${
              pi.last_payment_error?.message || "Unknown"
            }`
          );
        }
        break;
      }

      // ↩️ Refund processed
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

          const email = obj.receipt_email || process.env.DEMO_RECEIVER;
          if (email) {
            await sendEmail(
              email,
              "↩️ Payment Refunded",
              `Your payment of ${(obj.amount / 100).toFixed(2)} ${obj.currency.toUpperCase()} has been refunded.`
            );
          }
        }
        break;
      }

      default:
        console.debug(`ℹ️ Unhandled event type ${event.type}`);
    }
  } catch (err) {
    console.error("❌ DB/Email update error:", err);
  }

  res.json({ received: true });
};
