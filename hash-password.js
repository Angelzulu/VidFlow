// hash-password.js
// Run this to generate a bcrypt hash for your chosen password:
//
//   node hash-password.js "your-new-password"
//
// Then copy the printed hash into server.js as the value of
// USERS.admin.passwordHash

const bcrypt = require("bcryptjs");

const password = process.argv[2];

if (!password) {
  console.log("Usage: node hash-password.js \"your-password-here\"");
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
console.log("\nYour password hash:\n");
console.log(hash);
console.log("\nCopy this into server.js -> USERS.admin.passwordHash\n");
