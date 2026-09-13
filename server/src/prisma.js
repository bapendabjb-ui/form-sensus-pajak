"use strict";

const { PrismaClient } = require("@prisma/client");
const config = require("./config");

const prisma = new PrismaClient({
  log: config.isProd ? ["warn", "error"] : ["warn", "error"],
});

module.exports = prisma;
