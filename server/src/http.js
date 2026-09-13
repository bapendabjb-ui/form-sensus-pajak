"use strict";

/** Error dengan status HTTP, dipakai di seluruh route. */
class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const badRequest = (msg, details) => new ApiError(400, msg, details);
const unauthorized = (msg = "Tidak terautentikasi.") => new ApiError(401, msg);
const forbidden = (msg = "Akses ditolak.") => new ApiError(403, msg);
const notFound = (msg = "Data tidak ditemukan.") => new ApiError(404, msg);
const conflict = (msg, details) => new ApiError(409, msg, details);

/** Pembungkus async handler agar error otomatis diteruskan ke error handler. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Parse & validasi parameter id numerik. */
function parseId(raw, label = "id") {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`Parameter ${label} tidak valid.`);
  return n;
}

module.exports = { ApiError, badRequest, unauthorized, forbidden, notFound, conflict, wrap, parseId };
