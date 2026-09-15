"use strict";

/**
 * Reset password admin langsung di database (mis. saat password lupa).
 *
 *   node server/scripts/reset-admin.js [username] [passwordBaru]
 *
 * Username bawaan ADMIN_USERNAME. Tanpa passwordBaru, password acak dibuat dan
 * dicetak sekali. Akun dibuat bila username belum ada.
 */

const crypto = require("crypto");
const config = require("../src/config");
const prisma = require("../src/prisma");
const { hashPassword } = require("../src/auth");

async function main() {
  const username = (process.argv[2] || config.adminUsername).trim();
  const password = process.argv[3] || crypto.randomBytes(12).toString("base64url");
  if (password.length < 8) throw new Error("Password minimal 8 karakter.");

  const passwordHash = await hashPassword(password);
  const admin = await prisma.admin.upsert({
    where: { username },
    update: { passwordHash },
    create: { username, passwordHash },
  });

  console.log(`Password admin "${admin.username}" di-reset.`);
  console.log(`Password baru: ${password}`);
}

main()
  .catch((e) => {
    console.error("Reset gagal:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
