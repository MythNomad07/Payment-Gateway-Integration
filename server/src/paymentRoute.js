// server/src/paymentRoute.js
const express = require("express");
const Stripe = require("stripe");
const { v4: uuidv4 } = require("uuid");
const pool = require("./db");

const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// ✅ Create PaymentIntent + save to DB
router.post("/create-payment-intent", async (req, res) => {
  try {
    const { amount, currency = "usd" } = req.body;

    if (!amount) {
      return res.status(400).json({ error: "Amount is required (in cents)" });
    }

    // Generate local transaction ID
    const txn_id = uuidv4();

    // Create payment intent in Stripe (embed txn_id in metadata)
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: { txn_id },
    });

    // Insert into Postgres
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

// ✅ Check transaction status (by txn_id or payment_intent_id)
router.get("/status/:id", async (req, res) => {
  try {
    const { id } = req.params;

    let result;

    // Detect if it's a UUID (txn_id) or a Stripe PI (payment_intent_id)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (uuidRegex.test(id)) {
      // Looks like a UUID → search by txn_id
      result = await pool.query("SELECT * FROM transactions WHERE txn_id = $1", [id]);
    } else {
      // Otherwise → assume it's a payment_intent_id
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

// ✅ List all recent transactions (for dashboard)
router.get("/all", async (req, res) => {
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

module.exports = router;
