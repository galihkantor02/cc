/**
 * Bot Runner - Run the Telegram bot in long polling mode
 * This script is meant to be run separately from the Next.js server
 * For webhook mode, the bot is handled by /api/telegram/webhook
 *
 * Usage: npx tsx src/scripts/run-bot.ts
 */

import * as dotenv from "dotenv";
dotenv.config();

import { createBot } from "../lib/bot";

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("❌ TELEGRAM_BOT_TOKEN is not set in .env");
  process.exit(1);
}

console.log("🤖 Starting Bot Cek Indosat IM3...");
console.log("📡 Mode: Long Polling");
console.log("⏳ Connecting to Telegram...");

const bot = createBot(token);

// Start the bot in polling mode
bot
  .start({
    onStart: (botInfo) => {
      console.log(`\n✅ Bot @${botInfo.username} berhasil berjalan!`);
      console.log(`📱 Bot ID: ${botInfo.id}`);
      console.log(`🤖 Bot Name: ${botInfo.first_name}`);
      console.log(`\n🟢 Bot aktif dan siap menerima pesan...\n`);
      console.log(`Perintah tersedia:`);
      console.log(`  /start   - Mulai bot`);
      console.log(`  /login   - Login akun IM3`);
      console.log(`  /cek     - Cek semua info`);
      console.log(`  /pulsa   - Cek pulsa`);
      console.log(`  /kuota   - Cek kuota`);
      console.log(`  /aktif   - Masa aktif`);
      console.log(`  /bantuan - Panduan\n`);
    },
  })
  .catch((err) => {
    console.error("❌ Bot error:", err);
    process.exit(1);
  });

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n⏹️ Menghentikan bot...");
  await bot.stop();
  console.log("✅ Bot dihentikan.");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await bot.stop();
  process.exit(0);
});
