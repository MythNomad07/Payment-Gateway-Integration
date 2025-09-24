// server/src/paymentRoute.js
const express = require("express");
const Stripe = require("stripe");
const { v4: uuidv4 } = require("uuid");
const pool = require("./db"); // connect to DB

const router = express.Router();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// ✅ Create PaymentIntent + save to DB
router.post("/create-payment-intent", async (req, res) => {
  try {
    const { amount, currency = "usd" } = req.body;

    if (!amount) {
      return res.status(400).json({ error: "Amount is required (in cents)" });
    }

    // generate local transaction ID
    const txn_id = uuidv4();

    // create payment intent in Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: { txn_id }, // save local txn_id into Stripe for tracking
    });

    // insert into Postgres
    await pool.query(
      `INSERT INTO transactions (txn_id, payment_intent_id, amount, currency, status, metadata)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [txn_id, paymentIntent.id, amount, currency, "created", JSON.stringify({})]
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
router.get("/status/:txn_id", async (req, res) => {
  try {
    const { txn_id } = req.params;
    const result = await pool.query("SELECT * FROM transactions WHERE txn_id = $1", [txn_id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Error in status:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
