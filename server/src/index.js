const path = require("path");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

// ---------------------------------------
// 🔹 Serve static files from server/public
// ---------------------------------------
app.use(express.static(path.join(__dirname, "../public")));

// 🔹 Stripe Webhook (must come before express.json)
const webhookHandler = require("./webhook");
app.post("/webhook", express.raw({ type: "application/json" }), webhookHandler);

// 🔹 Normal Middleware
app.use(cors());
app.use(express.json());

// 🔹 Routes
const paymentRoute = require("./paymentRoute");
app.use("/api/payment", paymentRoute);

app.get("/", (req, res) => {
  res.send("Payment API with Stripe is working 🚀");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
