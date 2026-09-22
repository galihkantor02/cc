/**
 * Telegram Bot - Cek Indosat IM3
 * Bot Telegram untuk mengecek pulsa, kuota, masa aktif kartu Indosat IM3
 * menggunakan MyIM3 API (Reverse Engineering)
 */

import { Bot, Context, session, SessionFlavor, InlineKeyboard } from "grammy";
import { db } from "@/db";
import {
  botUsers,
  im3Accounts,
  otpSessions,
  accountCache,
  activityLog,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { myIM3Api, FullAccountInfo } from "./myim3-api";

// Session type for conversation state
interface SessionData {
  state?: "awaiting_phone" | "awaiting_otp" | "none";
  pendingPhone?: string;
  pendingOtpSession?: string;
  addingAccount?: boolean;
}

type MyContext = Context & SessionFlavor<SessionData>;

let botInstance: Bot<MyContext> | null = null;

export function createBot(token: string): Bot<MyContext> {
  if (botInstance) return botInstance;

  const bot = new Bot<MyContext>(token);

  // Session middleware
  bot.use(
    session({
      initial: (): SessionData => ({ state: "none" }),
    })
  );

  // ─────────────────────────────────────────
  // /start command
  // ─────────────────────────────────────────
  bot.command("start", async (ctx) => {
    await ensureBotUser(ctx);
    ctx.session.state = "none";

    const name = ctx.from?.first_name || "Kamu";
    const msg = `👋 *Halo, ${escMd(name)}!*

Selamat datang di *Bot Cek Indosat IM3* 🟡

Bot ini membantu kamu cek:
📱 *Pulsa* — saldo pulsa aktif
📶 *Kuota* — sisa kuota data & paket
⏳ *Masa Aktif* — tanggal kadaluarsa kartu
👤 *Profil* — informasi akun IM3

Untuk mulai, hubungkan nomor IM3 kamu dengan perintah:
\`/login\` — Hubungkan nomor IM3

*Perintah tersedia:*
/cek — Cek semua info akun
/pulsa — Cek saldo pulsa
/kuota — Cek sisa kuota
/aktif — Cek masa aktif kartu
/profil — Profil akun IM3
/login — Tambah/ganti nomor IM3
/logout — Hapus sesi akun
/akun — Daftar akun tersimpan
/bantuan — Panduan penggunaan`;

    await ctx.reply(msg, { parse_mode: "Markdown" });
  });

  // ─────────────────────────────────────────
  // /bantuan command
  // ─────────────────────────────────────────
  bot.command("bantuan", async (ctx) => {
    ctx.session.state = "none";
    const msg = `📖 *Panduan Bot Cek IM3*

*Cara menggunakan bot ini:*

1️⃣ Ketik \`/login\`
2️⃣ Masukkan nomor IM3 kamu *(format: 08xxxxxxxxxx)*
3️⃣ Masukkan kode OTP yang dikirim via SMS
4️⃣ Akun berhasil terhubung\\!

*Perintah yang tersedia:*

🔑 \`/login\` — Hubungkan nomor IM3
🔓 \`/logout\` — Hapus sesi IM3

📊 \`/cek\` — Info lengkap \\(pulsa \\+ kuota \\+ aktif\\)
💰 \`/pulsa\` — Cek saldo pulsa
📶 \`/kuota\` — Cek sisa kuota data
⏳ \`/aktif\` — Cek masa aktif kartu
👤 \`/profil\` — Profil akun IM3
📱 \`/akun\` — Daftar akun tersimpan

*Catatan:*
• Hanya mendukung kartu *Indosat IM3*
• OTP akan dikirim ke nomor yang didaftarkan
• Data di\\-cache selama 5 menit untuk kecepatan

*Butuh bantuan?* Hubungi support di @indosatcare`;

    await ctx.reply(msg, { parse_mode: "MarkdownV2" });
  });

  // ─────────────────────────────────────────
  // /login command — start OTP flow
  // ─────────────────────────────────────────
  bot.command("login", async (ctx) => {
    await ensureBotUser(ctx);
    ctx.session.state = "awaiting_phone";
    ctx.session.addingAccount = true;

    await ctx.reply(
      `📱 *Login ke MyIM3*\n\nMasukkan *nomor Indosat IM3* kamu:\n_(format: 08xxxxxxxxxx atau 628xxxxxxxxxx)_`,
      { parse_mode: "Markdown" }
    );
  });

  // ─────────────────────────────────────────
  // /logout command
  // ─────────────────────────────────────────
  bot.command("logout", async (ctx) => {
    const telegramId = String(ctx.from?.id);
    ctx.session.state = "none";

    try {
      const user = await db
        .select()
        .from(botUsers)
        .where(eq(botUsers.telegramId, telegramId))
        .limit(1);

      if (user.length === 0) {
        await ctx.reply("❌ Kamu belum login.");
        return;
      }

      // Delete all accounts for this user
      await db
        .delete(im3Accounts)
        .where(eq(im3Accounts.botUserId, user[0].id));

      // Delete OTP sessions
      await db
        .delete(otpSessions)
        .where(eq(otpSessions.telegramId, telegramId));

      await ctx.reply(
        "✅ *Berhasil logout!*\n\nSemua sesi akun IM3 telah dihapus.\nGunakan /login untuk menambah akun kembali.",
        { parse_mode: "Markdown" }
      );
    } catch {
      await ctx.reply("❌ Terjadi kesalahan saat logout. Coba lagi.");
    }
  });

  // ─────────────────────────────────────────
  // /akun command — list linked accounts
  // ─────────────────────────────────────────
  bot.command("akun", async (ctx) => {
    const telegramId = String(ctx.from?.id);
    ctx.session.state = "none";

    try {
      const user = await db
        .select()
        .from(botUsers)
        .where(eq(botUsers.telegramId, telegramId))
        .limit(1);

      if (user.length === 0) {
        await ctx.reply(
          "❌ Kamu belum terdaftar. Ketik /login untuk mulai."
        );
        return;
      }

      const accounts = await db
        .select()
        .from(im3Accounts)
        .where(
          and(
            eq(im3Accounts.botUserId, user[0].id),
            eq(im3Accounts.isActive, true)
          )
        );

      if (accounts.length === 0) {
        await ctx.reply(
          "📱 Belum ada akun IM3 yang terhubung.\n\nGunakan /login untuk menambah nomor IM3."
        );
        return;
      }

      let msg = `📱 *Akun IM3 Tersimpan* (${accounts.length})\n\n`;
      accounts.forEach((acc, i) => {
        const phone = myIM3Api.formatPhoneDisplay(acc.phoneNumber);
        const status = acc.isPrimary ? " ⭐ Utama" : "";
        msg += `${i + 1}\\. \`${escMd(phone)}\`${escMd(status)}\n`;
        if (acc.accountName) {
          msg += `   👤 ${escMd(acc.accountName)}\n`;
        }
        if (acc.lastSynced) {
          msg += `   🔄 Sync: ${formatDate(acc.lastSynced)}\n`;
        }
        msg += "\n";
      });

      msg += "_Gunakan /cek untuk melihat info semua akun_";

      await ctx.reply(msg, { parse_mode: "MarkdownV2" });
    } catch {
      await ctx.reply("❌ Terjadi kesalahan. Coba lagi.");
    }
  });

  // ─────────────────────────────────────────
  // /cek command — full info
  // ─────────────────────────────────────────
  bot.command("cek", async (ctx) => {
    await handleInfoCommand(ctx, "all");
  });

  // ─────────────────────────────────────────
  // /pulsa command
  // ─────────────────────────────────────────
  bot.command("pulsa", async (ctx) => {
    await handleInfoCommand(ctx, "balance");
  });

  // ─────────────────────────────────────────
  // /kuota command
  // ─────────────────────────────────────────
  bot.command("kuota", async (ctx) => {
    await handleInfoCommand(ctx, "quota");
  });

  // ─────────────────────────────────────────
  // /aktif command
  // ─────────────────────────────────────────
  bot.command("aktif", async (ctx) => {
    await handleInfoCommand(ctx, "active");
  });

  // ─────────────────────────────────────────
  // /profil command
  // ─────────────────────────────────────────
  bot.command("profil", async (ctx) => {
    await handleInfoCommand(ctx, "profile");
  });

  // ─────────────────────────────────────────
  // Handle text messages (for OTP flow)
  // ─────────────────────────────────────────
  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    const telegramId = String(ctx.from?.id);

    // Skip if it's a command
    if (text.startsWith("/")) return;

    const state = ctx.session.state;

    if (state === "awaiting_phone") {
      await handlePhoneInput(ctx, text, telegramId);
    } else if (state === "awaiting_otp") {
      await handleOtpInput(ctx, text, telegramId);
    } else {
      // Default response with keyboard
      await ctx.reply(
        "Gunakan perintah berikut:\n/cek — Info lengkap\n/pulsa — Cek pulsa\n/kuota — Cek kuota\n/aktif — Cek masa aktif\n/bantuan — Panduan"
      );
    }
  });

  // ─────────────────────────────────────────
  // Callback queries (inline buttons)
  // ─────────────────────────────────────────
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();

    if (data.startsWith("check_")) {
      const type = data.replace("check_", "") as
        | "all"
        | "balance"
        | "quota"
        | "active"
        | "profile";
      await handleInfoCommand(ctx, type);
    } else if (data === "login") {
      ctx.session.state = "awaiting_phone";
      await ctx.reply(
        "📱 Masukkan nomor Indosat IM3 kamu:",
        { parse_mode: "Markdown" }
      );
    } else if (data === "resend_otp") {
      const phone = ctx.session.pendingPhone;
      if (phone) {
        await ctx.reply("📤 Mengirim ulang OTP...");
        try {
          const res = await myIM3Api.sendOtp(phone);
          if (res.success) {
            if (res.sessionToken) {
              ctx.session.pendingOtpSession = res.sessionToken;
            }
            await ctx.reply(
              `✅ OTP dikirim ulang ke *${escMd(myIM3Api.formatPhoneDisplay(phone))}*\n\nMasukkan kode OTP 6 digit:`,
              { parse_mode: "Markdown" }
            );
          } else {
            await ctx.reply(`❌ ${res.message}`);
          }
        } catch {
          await ctx.reply("❌ Gagal mengirim ulang OTP. Coba /login lagi.");
          ctx.session.state = "none";
        }
      }
    }
  });

  // Error handler
  bot.catch((err) => {
    console.error("Bot error:", err.message);
  });

  botInstance = bot;
  return bot;
}

// ─────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────

async function ensureBotUser(ctx: MyContext) {
  if (!ctx.from) return;
  const telegramId = String(ctx.from.id);

  try {
    const existing = await db
      .select()
      .from(botUsers)
      .where(eq(botUsers.telegramId, telegramId))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(botUsers).values({
        telegramId,
        telegramUsername: ctx.from.username || null,
        telegramFirstName: ctx.from.first_name || null,
        telegramLastName: ctx.from.last_name || null,
      });
    }
  } catch {
    // Ignore
  }
}

async function handlePhoneInput(
  ctx: MyContext,
  phone: string,
  telegramId: string
) {
  // Validate phone number
  const clean = phone.replace(/\D/g, "");
  if (
    clean.length < 10 ||
    clean.length > 15 ||
    (!clean.startsWith("08") &&
      !clean.startsWith("628") &&
      !clean.startsWith("8"))
  ) {
    await ctx.reply(
      "❌ Format nomor tidak valid.\n\nContoh: *08123456789* atau *628123456789*",
      { parse_mode: "Markdown" }
    );
    return;
  }

  const normalizedPhone = myIM3Api.normalizePhone(phone);
  const displayPhone = myIM3Api.formatPhoneDisplay(phone);

  ctx.session.pendingPhone = normalizedPhone;

  const sendingMsg = await ctx.reply(
    `📤 Mengirim OTP ke *${escMd(displayPhone)}*\\.\\.\\.`,
    { parse_mode: "MarkdownV2" }
  );

  try {
    const result = await myIM3Api.sendOtp(normalizedPhone);

    // Store OTP session in DB
    const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 min
    await db
      .delete(otpSessions)
      .where(eq(otpSessions.telegramId, telegramId));

    await db.insert(otpSessions).values({
      telegramId,
      phoneNumber: normalizedPhone,
      sessionToken: result.sessionToken || null,
      status: "pending",
      expiresAt: expiry,
    });

    if (result.sessionToken) {
      ctx.session.pendingOtpSession = result.sessionToken;
    }

    if (result.success) {
      ctx.session.state = "awaiting_otp";

      const keyboard = new InlineKeyboard().text(
        "🔄 Kirim Ulang OTP",
        "resend_otp"
      );

      await ctx.reply(
        `✅ OTP berhasil dikirim ke *${escMd(displayPhone)}*\\!\n\n📩 Masukkan kode OTP 6 digit yang diterima via SMS:\n\n_OTP berlaku selama 5 menit_`,
        {
          parse_mode: "MarkdownV2",
          reply_markup: keyboard,
        }
      );
    } else {
      ctx.session.state = "none";
      await ctx.reply(
        `❌ *Gagal mengirim OTP*\n\n${escMd(result.message)}\n\n_Pastikan nomor yang kamu masukkan adalah kartu Indosat IM3 yang aktif\\._`,
        { parse_mode: "MarkdownV2" }
      );
    }
  } catch (err) {
    ctx.session.state = "none";
    console.error("OTP send error:", err);
    await ctx.reply(
      "❌ Terjadi kesalahan saat mengirim OTP.\n\nKemungkinan penyebab:\n• Nomor bukan kartu Indosat IM3\n• Server MyIM3 sedang gangguan\n\nCoba lagi dengan /login"
    );
  }

  // Try to delete the "sending..." message
  try {
    await ctx.api.deleteMessage(ctx.chat!.id, sendingMsg.message_id);
  } catch {
    // ignore
  }
}

async function handleOtpInput(
  ctx: MyContext,
  otp: string,
  telegramId: string
) {
  const otpClean = otp.replace(/\D/g, "");

  if (otpClean.length < 4 || otpClean.length > 8) {
    await ctx.reply(
      "❌ Format OTP tidak valid. Masukkan kode OTP 6 digit dari SMS."
    );
    return;
  }

  const phone = ctx.session.pendingPhone;
  if (!phone) {
    await ctx.reply("❌ Sesi kadaluarsa. Mulai ulang dengan /login");
    ctx.session.state = "none";
    return;
  }

  const verifyingMsg = await ctx.reply("🔐 Memverifikasi OTP...");

  try {
    const sessionToken = ctx.session.pendingOtpSession;
    const result = await myIM3Api.verifyOtp(phone, otpClean, sessionToken);

    if (result.success && result.accessToken) {
      // Ensure bot user exists
      await ensureBotUser(ctx);

      const user = await db
        .select()
        .from(botUsers)
        .where(eq(botUsers.telegramId, telegramId))
        .limit(1);

      if (user.length === 0) {
        await ctx.reply("❌ Terjadi kesalahan akun. Coba /start terlebih dahulu.");
        return;
      }

      const expiresAt = result.expiresIn
        ? new Date(Date.now() + result.expiresIn * 1000)
        : new Date(Date.now() + 24 * 3600 * 1000);

      // Check if account already exists
      const existing = await db
        .select()
        .from(im3Accounts)
        .where(
          and(
            eq(im3Accounts.botUserId, user[0].id),
            eq(im3Accounts.phoneNumber, phone)
          )
        )
        .limit(1);

      // Check if there's any account (for isPrimary)
      const allAccounts = await db
        .select()
        .from(im3Accounts)
        .where(eq(im3Accounts.botUserId, user[0].id));

      const isPrimary = allAccounts.length === 0;

      if (existing.length > 0) {
        // Update existing
        await db
          .update(im3Accounts)
          .set({
            accessToken: result.accessToken,
            refreshToken: result.refreshToken || null,
            tokenExpiry: expiresAt,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(im3Accounts.id, existing[0].id));
      } else {
        // Insert new
        await db.insert(im3Accounts).values({
          botUserId: user[0].id,
          phoneNumber: phone,
          accessToken: result.accessToken,
          refreshToken: result.refreshToken || null,
          tokenExpiry: expiresAt,
          isActive: true,
          isPrimary: isPrimary,
        });
      }

      // Update OTP session status
      await db
        .update(otpSessions)
        .set({ status: "verified" })
        .where(eq(otpSessions.telegramId, telegramId));

      ctx.session.state = "none";
      ctx.session.pendingPhone = undefined;
      ctx.session.pendingOtpSession = undefined;

      const displayPhone = myIM3Api.formatPhoneDisplay(phone);

      await ctx.reply(
        `✅ *Login Berhasil\\!*\n\n📱 Nomor: \`${escMd(displayPhone)}\`\n\nAkun IM3 kamu berhasil terhubung\\!\n\nGunakan perintah:\n/cek — Info lengkap\n/pulsa — Cek pulsa\n/kuota — Cek kuota\n/aktif — Masa aktif`,
        { parse_mode: "MarkdownV2" }
      );

      // Fetch and show account info immediately
      await ctx.reply("🔄 Mengambil info akun...");
      try {
        const info = await myIM3Api.getFullAccountInfo(result.accessToken, phone);
        const displayPhone2 = myIM3Api.formatPhoneDisplay(phone);

        // Update account name
        if (info.profile.name && info.profile.name !== "Pelanggan IM3") {
      await db
          .update(im3Accounts)
          .set({
            accountName: info.profile.name,
            lastSynced: new Date(),
          })
          .where(
            and(
              eq(im3Accounts.botUserId, user[0].id),
              eq(im3Accounts.phoneNumber, phone)
            )
          );
        }

        const msg = buildFullInfoMessage(info, displayPhone2);
        await ctx.reply(msg, { parse_mode: "MarkdownV2" });
      } catch {
        await ctx.reply(
          "⚠️ Tidak dapat mengambil info akun sekarang. Gunakan /cek untuk coba lagi."
        );
      }
    } else {
      await ctx.reply(
        `❌ *OTP Tidak Valid*\n\n${escMd(result.message || "Kode OTP salah atau kadaluarsa.")}\n\n_Coba lagi atau ketik /login untuk memulai ulang._`,
        { parse_mode: "MarkdownV2" }
      );
    }
  } catch (err) {
    console.error("OTP verify error:", err);
    await ctx.reply(
      "❌ Terjadi kesalahan saat verifikasi OTP.\n\nCoba /login untuk memulai ulang."
    );
  }

  // Delete the "verifying..." message
  try {
    await ctx.api.deleteMessage(ctx.chat!.id, verifyingMsg.message_id);
  } catch {
    // ignore
  }
}

async function handleInfoCommand(
  ctx: MyContext,
  type: "all" | "balance" | "quota" | "active" | "profile"
) {
  const telegramId = String(ctx.from?.id);
  ctx.session.state = "none";

  try {
    const user = await db
      .select()
      .from(botUsers)
      .where(eq(botUsers.telegramId, telegramId))
      .limit(1);

    if (user.length === 0) {
      await ctx.reply(
        "❌ Kamu belum login.\n\nGunakan /login untuk menghubungkan nomor IM3 kamu."
      );
      return;
    }

    const accounts = await db
      .select()
      .from(im3Accounts)
      .where(
        and(
          eq(im3Accounts.botUserId, user[0].id),
          eq(im3Accounts.isActive, true)
        )
      );

    if (accounts.length === 0) {
      await ctx.reply(
        "📱 Belum ada akun IM3 yang terhubung.\n\nGunakan /login untuk menambah nomor IM3."
      );
      return;
    }

    const loadingMsg = await ctx.reply("🔄 Mengambil data dari server IM3...");

    // Process primary account first, then others
    const sorted = [
      ...accounts.filter((a) => a.isPrimary),
      ...accounts.filter((a) => !a.isPrimary),
    ];

    let hasError = false;

    for (const account of sorted) {
      if (!account.accessToken) {
        await ctx.reply(
          `❌ Token akun \`${escMd(myIM3Api.formatPhoneDisplay(account.phoneNumber))}\` tidak valid.\nGunakan /login untuk login ulang.`,
          { parse_mode: "MarkdownV2" }
        );
        continue;
      }

      try {
        let accessToken = account.accessToken;

        // Check token expiry and refresh if needed
        if (account.tokenExpiry && account.tokenExpiry < new Date()) {
          if (account.refreshToken) {
            const refreshed = await myIM3Api.refreshToken(account.refreshToken);
            if (refreshed.success && refreshed.accessToken) {
              accessToken = refreshed.accessToken;
              const newExpiry = new Date(
                Date.now() + (refreshed.expiresIn || 86400) * 1000
              );
              await db
                .update(im3Accounts)
                .set({
                  accessToken: refreshed.accessToken,
                  refreshToken: refreshed.refreshToken || account.refreshToken,
                  tokenExpiry: newExpiry,
                  updatedAt: new Date(),
                })
                .where(eq(im3Accounts.id, account.id));
            } else {
              await ctx.reply(
                `❌ Sesi akun \`${escMd(myIM3Api.formatPhoneDisplay(account.phoneNumber))}\` kadaluarsa\\.\nGunakan /login untuk login ulang\\.`,
                { parse_mode: "MarkdownV2" }
              );
              continue;
            }
          } else {
            await ctx.reply(
              `❌ Sesi akun \`${escMd(myIM3Api.formatPhoneDisplay(account.phoneNumber))}\` kadaluarsa\\.\nGunakan /login untuk login ulang\\.`,
              { parse_mode: "MarkdownV2" }
            );
            continue;
          }
        }

        const info = await myIM3Api.getFullAccountInfo(
          accessToken,
          account.phoneNumber
        );
        const displayPhone = myIM3Api.formatPhoneDisplay(account.phoneNumber);

        // Update last synced
        await db
          .update(im3Accounts)
          .set({
            lastSynced: new Date(),
            accountName: info.profile.name || account.accountName,
          })
          .where(eq(im3Accounts.id, account.id));

        // Log activity
        await db.insert(activityLog).values({
          telegramId,
          command: `/${type === "all" ? "cek" : type}`,
          phoneNumber: account.phoneNumber,
          status: "success",
        });

        let msg = "";

        if (type === "all") {
          msg = buildFullInfoMessage(info, displayPhone);
        } else if (type === "balance") {
          msg = buildBalanceMessage(info, displayPhone);
        } else if (type === "quota") {
          msg = buildQuotaMessage(info, displayPhone);
        } else if (type === "active") {
          msg = buildActiveMessage(info, displayPhone);
        } else if (type === "profile") {
          msg = buildProfileMessage(info, displayPhone);
        }

        await ctx.reply(msg, { parse_mode: "MarkdownV2" });
      } catch (err) {
        hasError = true;
        console.error("Fetch info error:", err);
        const displayPhone = myIM3Api.formatPhoneDisplay(account.phoneNumber);

        // Log error
        try {
          await db.insert(activityLog).values({
            telegramId,
            command: `/${type}`,
            phoneNumber: account.phoneNumber,
            status: "error",
            details: String(err),
          });
        } catch {
          // ignore
        }

        await ctx.reply(
          `⚠️ Gagal mengambil data untuk *${escMd(displayPhone)}*\\.\n\n_Server MyIM3 mungkin sedang gangguan\\. Coba beberapa menit lagi\\._`,
          { parse_mode: "MarkdownV2" }
        );
      }
    }

    // Delete loading message
    try {
      await ctx.api.deleteMessage(ctx.chat!.id, loadingMsg.message_id);
    } catch {
      // ignore
    }
  } catch (err) {
    console.error("HandleInfo error:", err);
    await ctx.reply("❌ Terjadi kesalahan. Coba lagi.");
  }
}

// ─────────────────────────────────────────────────────────────────────────
// MESSAGE BUILDERS
// ─────────────────────────────────────────────────────────────────────────

function buildFullInfoMessage(info: FullAccountInfo, phone: string): string {
  const now = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  let msg = `📊 *INFO AKUN IM3*\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n\n`;

  // Profile section
  msg += `👤 *Profil*\n`;
  msg += `📱 Nomor: \`${escMd(phone)}\`\n`;
  if (info.profile.name && info.profile.name !== "Pelanggan IM3") {
    msg += `🏷️ Nama: ${escMd(info.profile.name)}\n`;
  }
  msg += `📋 Tipe: ${escMd(info.profile.accountType)}\n`;
  msg += `🔆 Status: ${escMd(info.profile.status)}\n`;
  msg += `\n`;

  // Balance section
  msg += `💰 *Pulsa*\n`;
  msg += `💵 Saldo: *${escMd(info.balance.balanceFormatted)}*\n\n`;

  // Active period
  msg += `⏳ *Masa Aktif*\n`;
  if (info.profile.activeUntil && info.profile.activeUntil !== "-") {
    msg += `📅 Aktif s\\.d\\.: *${escMd(info.profile.activeUntil)}*\n\n`;
  } else {
    msg += `📅 Aktif s\\.d\\.: _Tidak tersedia_\n\n`;
  }

  // Quota section
  msg += `📶 *Kuota & Paket*\n`;
  if (info.packages.length === 0) {
    msg += `_Tidak ada paket aktif_\n`;
  } else {
    info.packages.slice(0, 6).forEach((pkg) => {
      msg += `\n🔸 *${escMd(pkg.name)}*\n`;
      msg += `   📊 Sisa: ${escMd(pkg.quotaRemaining)} \\/ ${escMd(pkg.quota)}\n`;
      if (pkg.validUntil && pkg.validUntil !== "-") {
        msg += `   📅 Berlaku: ${escMd(pkg.validUntil)}\n`;
      }
    });
  }

  msg += `\n━━━━━━━━━━━━━━━━━━\n`;
  msg += `🕐 _Diperbarui: ${escMd(now)} WIB_`;

  return msg;
}

function buildBalanceMessage(info: FullAccountInfo, phone: string): string {
  const now = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  let msg = `💰 *CEK PULSA IM3*\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `📱 Nomor: \`${escMd(phone)}\`\n`;
  msg += `💵 Saldo Pulsa: *${escMd(info.balance.balanceFormatted)}*\n`;
  msg += `\n━━━━━━━━━━━━━━━━━━\n`;
  msg += `🕐 _${escMd(now)} WIB_`;

  return msg;
}

function buildQuotaMessage(info: FullAccountInfo, phone: string): string {
  const now = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  let msg = `📶 *CEK KUOTA IM3*\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `📱 Nomor: \`${escMd(phone)}\`\n\n`;

  if (info.packages.length === 0) {
    msg += `_Tidak ada paket kuota aktif_\n`;
  } else {
    info.packages.slice(0, 8).forEach((pkg, i) => {
      msg += `${i + 1}\\. *${escMd(pkg.name)}*\n`;
      msg += `   📊 Sisa: *${escMd(pkg.quotaRemaining)}*\n`;
      msg += `   📦 Total: ${escMd(pkg.quota)}\n`;
      if (pkg.validUntil && pkg.validUntil !== "-") {
        msg += `   ⏳ Berlaku: ${escMd(pkg.validUntil)}\n`;
      }
      msg += `\n`;
    });
  }

  msg += `━━━━━━━━━━━━━━━━━━\n`;
  msg += `🕐 _${escMd(now)} WIB_`;

  return msg;
}

function buildActiveMessage(info: FullAccountInfo, phone: string): string {
  const now = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  let msg = `⏳ *MASA AKTIF IM3*\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `📱 Nomor: \`${escMd(phone)}\`\n`;
  msg += `🔆 Status: ${escMd(info.profile.status)}\n`;

  if (info.profile.activeUntil && info.profile.activeUntil !== "-") {
    msg += `📅 Aktif s\\.d\\.: *${escMd(info.profile.activeUntil)}*\n`;
  } else {
    msg += `📅 Masa aktif: _Tidak tersedia_\n`;
    msg += `\n_\\*Gunakan \\*888\\# atau aplikasi MyIM3 untuk info lengkap_\n`;
  }

  msg += `\n━━━━━━━━━━━━━━━━━━\n`;
  msg += `🕐 _${escMd(now)} WIB_`;

  return msg;
}

function buildProfileMessage(info: FullAccountInfo, phone: string): string {
  const now = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  let msg = `👤 *PROFIL AKUN IM3*\n`;
  msg += `━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `📱 Nomor: \`${escMd(phone)}\`\n`;

  if (info.profile.name && info.profile.name !== "Pelanggan IM3") {
    msg += `🏷️ Nama: ${escMd(info.profile.name)}\n`;
  }

  msg += `📋 Tipe Akun: ${escMd(info.profile.accountType)}\n`;
  msg += `🔆 Status: ${escMd(info.profile.status)}\n`;
  msg += `💵 Pulsa: ${escMd(info.balance.balanceFormatted)}\n`;

  if (info.profile.activeUntil && info.profile.activeUntil !== "-") {
    msg += `📅 Aktif s\\.d\\.: ${escMd(info.profile.activeUntil)}\n`;
  }

  msg += `\n━━━━━━━━━━━━━━━━━━\n`;
  msg += `🕐 _${escMd(now)} WIB_`;

  return msg;
}

// ─────────────────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────

/** Escape MarkdownV2 special characters */
function escMd(text: string): string {
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

function formatDate(date: Date | null): string {
  if (!date) return "-";
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

export { botInstance };
