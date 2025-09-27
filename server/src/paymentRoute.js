// server/src/paymentRoute.js
const express = require("express");
const Stripe = require("stripe");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");   // ✅ use bcryptjs for portability
const pool = require("./db");
const PDFDocument = require("pdfkit"); // ✅ for PDF receipts

const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// 🔑 Secure Admin Auth Middleware
async function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.replace("Bearer ", "");

  if (!token) {
    return res.status(403).json({ error: "Forbidden: Missing Admin Key" });
  }

  try {
    const match = await bcrypt.compare(token, process.env.ADMIN_KEY_HASH);
    if (!match) {
      return res.status(403).json({ error: "Forbidden: Invalid Admin Key" });
    }
    next();
  } catch (err) {
    console.error("❌ Error checking admin key:", err);
    return res.status(500).json({ error: "Internal auth error" });
  }
}

// ✅ Create PaymentIntent + save to DB
router.post("/create-payment-intent", async (req, res) => {
  try {
    const { amount, currency = "usd" } = req.body;
    if (!amount) {
      return res.status(400).json({ error: "Amount is required (in cents)" });
    }

    const txn_id = uuidv4();
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: { txn_id },
    });

    await pool.query(
      `INSERT INTO transactions 
         (txn_id, payment_intent_id, amount, currency, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        txn_id,
        paymentIntent.id,
        amount.toString(),
        currency,
        "created",
        JSON.stringify(paymentIntent.metadata || {}),
      ]
    );

    res.json({
      clientSecret: paymentIntent.client_secret,
      txn_id,
      payment_intent_id: paymentIntent.id,
    });
  } catch (err) {
    console.error("❌ Error in create-payment-intent:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Check transaction status
router.get("/status/:id", async (req, res) => {
  try {
    const { id } = req.params;
    let result;

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (uuidRegex.test(id)) {
      result = await pool.query("SELECT * FROM transactions WHERE txn_id = $1", [id]);
    } else {
      result = await pool.query("SELECT * FROM transactions WHERE payment_intent_id = $1", [id]);
    }

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error in status:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ List all transactions (admin only)
router.get("/all", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM transactions ORDER BY created_at DESC LIMIT 50"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching all transactions:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Refund a payment (admin only)
router.post("/refund", requireAdmin, async (req, res) => {
  try {
    const { payment_intent_id } = req.body;
    if (!payment_intent_id) {
      return res.status(400).json({ error: "payment_intent_id required" });
    }

    const refund = await stripe.refunds.create({ payment_intent: payment_intent_id });

    await pool.query(
      `UPDATE transactions 
         SET status=$1, updated_at=NOW(), metadata = metadata || $2::jsonb 
       WHERE payment_intent_id=$3`,
      ["refunded", JSON.stringify({ refund_id: refund.id }), payment_intent_id]
    );

    res.json({ success: true, refund });
  } catch (err) {
    console.error("❌ Error processing refund:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Verify and sync status with Stripe (admin only)
router.post("/verify-status", requireAdmin, async (req, res) => {
  try {
    const { payment_intent_id } = req.body;
    if (!payment_intent_id) {
      return res.status(400).json({ error: "payment_intent_id required" });
    }

    // Ask Stripe for the latest info
    const pi = await stripe.paymentIntents.retrieve(payment_intent_id);

    let status = "created";
    if (pi.status === "succeeded") status = "succeeded";
    else if (pi.status === "canceled" || pi.status === "requires_payment_method") status = "failed";

    await pool.query(
      `UPDATE transactions 
         SET status=$1, updated_at=NOW(), metadata = metadata || $3::jsonb 
       WHERE payment_intent_id=$2`,
      [status, payment_intent_id, JSON.stringify({ stripe_status: pi.status })]
    );

    res.json({ success: true, status, stripe_status: pi.status });
  } catch (err) {
    console.error("❌ Error in verify-status:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Generate PDF Receipt (admin only)
router.get("/receipt/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "SELECT * FROM transactions WHERE payment_intent_id=$1 OR txn_id=$1",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const txn = result.rows[0];

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=receipt-${txn.payment_intent_id}.pdf`
    );

    const doc = new PDFDocument();
    doc.pipe(res);

    // Header
    doc.fontSize(20).text("🧾 Payment Receipt", { align: "center" });
    doc.moveDown();

    // Transaction details
    doc.fontSize(12).text(`Transaction ID: ${txn.txn_id}`);
    doc.text(`PaymentIntent ID: ${txn.payment_intent_id}`);
    doc.text(`Amount: ${(txn.amount / 100).toFixed(2)} ${txn.currency.toUpperCase()}`);
    doc.text(`Status: ${txn.status}`);
    doc.text(`Created At: ${new Date(txn.created_at).toLocaleString()}`);
    doc.text(`Updated At: ${new Date(txn.updated_at).toLocaleString()}`);

    if (txn.metadata) {
      doc.moveDown().text("Metadata:");
      doc.font("Courier").text(JSON.stringify(txn.metadata, null, 2));
      doc.font("Helvetica");
    }

    doc.end();
  } catch (err) {
    console.error("❌ Error generating receipt:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
