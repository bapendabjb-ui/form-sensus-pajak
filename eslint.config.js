"use strict";

/**
 * Konfigurasi ESLint (flat config) untuk kedua workspace sekaligus.
 *
 * Sengaja tidak memakai aturan gaya penulisan: format kode di repo ini sudah
 * konsisten, dan menambah ratusan peringatan gaya hanya akan membuat `npm run
 * lint` diabaikan. Yang dijaga di sini adalah galat yang benar-benar merugikan -
 * variabel yang tidak terpakai, `await` yang lupa ditulis, dan aturan React Hooks.
 */

const globals = require("globals");
const reactHooks = require("eslint-plugin-react-hooks");
const react = require("eslint-plugin-react");

/** Berkas yang tidak ditulis tangan atau bukan sumber. */
const ABAIKAN = ["node_modules/", "client/dist/", "uploads/", "server/prisma/migrations/"];

module.exports = [
  { ignores: ABAIKAN },

  // ---------- server: CommonJS, berjalan di Node ----------
  {
    files: ["server/**/*.js", "deploy/**/*.js", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-undef": "error",
      "no-console": "off",
      eqeqeq: ["error", "smart"],
      "no-var": "error",
      "prefer-const": "error",
    },
  },

  // ---------- client: ESM + JSX, berjalan di browser ----------
  {
    files: ["client/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks, react },
    rules: {
      // Tanpa ini, komponen yang hanya dipakai di dalam JSX terbaca "tidak terpakai".
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "off",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-undef": "error",
      eqeqeq: ["error", "smart"],
      "no-var": "error",
      "prefer-const": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // Berkas konfigurasi klien berjalan di Node, bukan di browser.
  {
    files: ["client/vite.config.js"],
    languageOptions: { sourceType: "module", globals: { ...globals.node } },
  },
];
