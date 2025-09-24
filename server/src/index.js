require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();

// ---------------------------------------
// 🔹 Stripe Webhook Route (raw body)
// MUST come before express.json()
// ---------------------------------------
const webhookHandler = require("./webhook");
app.post("/webhook", express.raw({ type: "application/json" }), webhookHandler);

// ---------------------------------------
// 🔹 Normal Middleware
// ---------------------------------------
app.use(cors());
app.use(express.json());

// ---------------------------------------
// 🔹 Payment Routes
// ---------------------------------------
const paymentRoute = require("./paymentRoute");
app.use("/api/payment", paymentRoute);

// ---------------------------------------
// 🔹 Test Route
// ---------------------------------------
app.get("/test-cors", (req, res) => {
  console.log("✅ /test-cors route hit");
  res.json({ message: "CORS is working ✅" });
});

// ---------------------------------------
// 🔹 Root Route
// ---------------------------------------
app.get("/", (req, res) => {
  res.send("Payment API with Stripe is working 🚀");
});

// ---------------------------------------
// 🔹 Start Server
// ---------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
