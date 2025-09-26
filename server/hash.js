// hash.js
const bcrypt = require("bcrypt");

const adminKey = "Aadi@0703"; // your real key
bcrypt.hash(adminKey, 10).then(hash => {
  console.log("Your hash:", hash);
});
