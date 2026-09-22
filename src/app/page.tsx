"use client";

import { useState, useEffect } from "react";

interface BotInfo {
  id: number;
  username: string;
  first_name: string;
  is_bot: boolean;
}

interface Stats {
  totalUsers: number;
  totalAccounts: number;
  recentActivity: Array<{
    id: number;
    telegramId: string;
    command: string;
    phoneNumber: string | null;
    status: string;
    createdAt: string;
  }>;
}

interface StatusData {
  status: string;
  botConfigured: boolean;
  botInfo: BotInfo | null;
  stats: Stats;
}

export default function Dashboard() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookResult, setWebhookResult] = useState<string | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookInfo, setWebhookInfo] = useState<{ url?: string; pending_update_count?: number; last_error_message?: string } | null>(null);

  useEffect(() => {
    fetchStatus();
    fetchWebhookInfo();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchStatus() {
    try {
      const res = await fetch("/api/bot/status");
      const data = await res.json();
      setStatus(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function fetchWebhookInfo() {
    try {
      const res = await fetch("/api/bot/setup-webhook");
      const data = await res.json();
      if (data.success) {
        setWebhookInfo(data.data);
      }
    } catch {
      // ignore
    }
  }

  async function setupWebhook() {
    setWebhookLoading(true);
    setWebhookResult(null);
    try {
      const res = await fetch("/api/bot/setup-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl || undefined }),
      });
      const data = await res.json();
      if (data.success) {
        setWebhookResult(`✅ ${data.message}`);
        fetchWebhookInfo();
      } else {
        setWebhookResult(`❌ ${data.error || "Gagal setup webhook"}`);
      }
    } catch {
      setWebhookResult("❌ Terjadi kesalahan koneksi");
    } finally {
      setWebhookLoading(false);
    }
  }

  async function deleteWebhook() {
    setWebhookLoading(true);
    try {
      const res = await fetch("/api/bot/setup-webhook", { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setWebhookResult("✅ Webhook berhasil dihapus");
        setWebhookInfo(null);
        fetchWebhookInfo();
      } else {
        setWebhookResult("❌ Gagal menghapus webhook");
      }
    } catch {
      setWebhookResult("❌ Terjadi kesalahan");
    } finally {
      setWebhookLoading(false);
    }
  }

  const isConfigured = status?.botConfigured;
  const botName = status?.botInfo?.first_name;
  const botUsername = status?.botInfo?.username;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
        }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url('/images/hero-bg.jpg')`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="relative z-10 container mx-auto px-6 py-12">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-orange-500 flex items-center justify-center text-2xl shadow-lg shadow-orange-500/30">
              🤖
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">
                Bot Cek Indosat IM3
              </h1>
              <p className="text-orange-300 text-sm mt-1">
                Telegram Bot · MyIM3 API · Reverse Engineering
              </p>
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex flex-wrap gap-3">
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
                isConfigured
                  ? "bg-green-500/20 text-green-300 border border-green-500/30"
                  : "bg-red-500/20 text-red-300 border border-red-500/30"
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  isConfigured ? "bg-green-400 animate-pulse" : "bg-red-400"
                }`}
              />
              {isConfigured ? "Bot Aktif" : "Bot Tidak Terkonfigurasi"}
            </div>

            {botUsername && (
              <a
                href={`https://t.me/${botUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
              >
                📱 @{botUsername}
              </a>
            )}

            <div className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-orange-500/20 text-orange-300 border border-orange-500/30">
              👥 {status?.stats.totalUsers || 0} Pengguna
            </div>

            <div className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30">
              📱 {status?.stats.totalAccounts || 0} Akun IM3
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-8">
        {!isConfigured && (
          <div className="mb-8 p-6 rounded-2xl bg-yellow-500/10 border border-yellow-500/30">
            <h2 className="text-yellow-400 font-bold text-lg mb-3">
              ⚠️ Setup Diperlukan
            </h2>
            <p className="text-yellow-300/80 text-sm mb-4">
              Bot belum terkonfigurasi. Tambahkan{" "}
              <code className="bg-yellow-900/30 px-2 py-0.5 rounded text-yellow-300">
                TELEGRAM_BOT_TOKEN
              </code>{" "}
              ke file <code className="bg-yellow-900/30 px-2 py-0.5 rounded text-yellow-300">.env</code> untuk mengaktifkan bot.
            </p>
            <div className="bg-gray-900/50 rounded-xl p-4 font-mono text-sm text-gray-300">
              <p className="text-gray-500 mb-1"># .env</p>
              <p>TELEGRAM_BOT_TOKEN=<span className="text-orange-400">your_bot_token_here</span></p>
              <p>WEBHOOK_URL=<span className="text-orange-400">https://your-domain.com</span></p>
            </div>
            <div className="mt-4 text-sm text-yellow-300/70">
              <p>Cara mendapatkan bot token: Hubungi <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">@BotFather</a> di Telegram → /newbot</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Bot Info Card */}
            {isConfigured && status?.botInfo && (
              <div className="rounded-2xl bg-gray-900 border border-gray-800 p-6">
                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  🤖 Info Bot
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">
                      Nama Bot
                    </p>
                    <p className="text-white font-medium">{botName}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">
                      Username
                    </p>
                    <p className="text-blue-400 font-medium">@{botUsername}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">
                      Bot ID
                    </p>
                    <p className="text-gray-300 font-mono text-sm">
                      {status.botInfo.id}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wide mb-1">
                      Webhook Status
                    </p>
                    <p className={`text-sm font-medium ${webhookInfo?.url ? "text-green-400" : "text-yellow-400"}`}>
                      {webhookInfo?.url ? "✅ Aktif" : "⚠️ Tidak Aktif"}
                    </p>
                  </div>
                </div>

                {webhookInfo?.url && (
                  <div className="mt-4 p-3 bg-gray-800/50 rounded-xl">
                    <p className="text-gray-500 text-xs mb-1">Webhook URL</p>
                    <p className="text-green-300 text-sm font-mono break-all">
                      {webhookInfo.url}
                    </p>
                    {webhookInfo.pending_update_count !== undefined && (
                      <p className="text-gray-400 text-xs mt-1">
                        Pending updates: {webhookInfo.pending_update_count}
                      </p>
                    )}
                    {webhookInfo.last_error_message && (
                      <p className="text-red-400 text-xs mt-1">
                        Error: {webhookInfo.last_error_message}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Webhook Setup */}
            {isConfigured && (
              <div className="rounded-2xl bg-gray-900 border border-gray-800 p-6">
                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  🔗 Setup Webhook
                </h2>
                <p className="text-gray-400 text-sm mb-4">
                  Atur webhook agar bot bisa menerima pesan dari Telegram secara real-time.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="text-gray-400 text-sm block mb-2">
                      Webhook URL (kosongkan untuk auto-detect)
                    </label>
                    <input
                      type="text"
                      value={webhookUrl}
                      onChange={(e) => setWebhookUrl(e.target.value)}
                      placeholder="https://your-domain.com/api/telegram/webhook"
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={setupWebhook}
                      disabled={webhookLoading}
                      className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-medium py-3 px-6 rounded-xl transition-colors text-sm"
                    >
                      {webhookLoading ? "⏳ Memproses..." : "🔗 Set Webhook"}
                    </button>
                    <button
                      onClick={deleteWebhook}
                      disabled={webhookLoading}
                      className="bg-red-500/20 hover:bg-red-500/30 disabled:opacity-50 text-red-400 border border-red-500/30 font-medium py-3 px-6 rounded-xl transition-colors text-sm"
                    >
                      🗑️ Hapus
                    </button>
                  </div>

                  {webhookResult && (
                    <div className={`p-3 rounded-xl text-sm ${webhookResult.startsWith("✅") ? "bg-green-500/10 text-green-300 border border-green-500/20" : "bg-red-500/10 text-red-300 border border-red-500/20"}`}>
                      {webhookResult}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Commands Reference */}
            <div className="rounded-2xl bg-gray-900 border border-gray-800 p-6">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                📋 Perintah Bot
              </h2>
              <div className="space-y-2">
                {[
                  { cmd: "/start", desc: "Mulai bot & lihat panduan", icon: "🚀" },
                  { cmd: "/login", desc: "Login akun Indosat IM3 via OTP", icon: "🔑" },
                  { cmd: "/cek", desc: "Cek semua info (pulsa + kuota + aktif)", icon: "📊" },
                  { cmd: "/pulsa", desc: "Cek saldo pulsa", icon: "💰" },
                  { cmd: "/kuota", desc: "Cek sisa kuota internet", icon: "📶" },
                  { cmd: "/aktif", desc: "Cek masa aktif kartu", icon: "⏳" },
                  { cmd: "/profil", desc: "Profil akun IM3", icon: "👤" },
                  { cmd: "/akun", desc: "Daftar akun tersimpan", icon: "📱" },
                  { cmd: "/logout", desc: "Hapus sesi akun IM3", icon: "🔓" },
                  { cmd: "/bantuan", desc: "Panduan lengkap", icon: "📖" },
                ].map((item) => (
                  <div
                    key={item.cmd}
                    className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/50 hover:bg-gray-800 transition-colors"
                  >
                    <span className="text-xl">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <code className="text-orange-400 text-sm font-mono">
                        {item.cmd}
                      </code>
                      <p className="text-gray-400 text-xs mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Stats */}
            <div className="rounded-2xl bg-gray-900 border border-gray-800 p-6">
              <h2 className="text-lg font-bold text-white mb-4">📈 Statistik</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
                  <div>
                    <p className="text-blue-400 text-sm font-medium">Total Pengguna</p>
                    <p className="text-white text-2xl font-bold">
                      {loading ? "..." : status?.stats.totalUsers || 0}
                    </p>
                  </div>
                  <span className="text-3xl">👥</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-orange-500/10 rounded-xl border border-orange-500/20">
                  <div>
                    <p className="text-orange-400 text-sm font-medium">Akun IM3 Terhubung</p>
                    <p className="text-white text-2xl font-bold">
                      {loading ? "..." : status?.stats.totalAccounts || 0}
                    </p>
                  </div>
                  <span className="text-3xl">📱</span>
                </div>
              </div>
            </div>

            {/* How it Works */}
            <div className="rounded-2xl bg-gray-900 border border-gray-800 p-6">
              <h2 className="text-lg font-bold text-white mb-4">⚙️ Cara Kerja</h2>
              <div className="space-y-4">
                {[
                  {
                    step: "1",
                    title: "Login via OTP",
                    desc: "User memasukkan nomor IM3, bot mengirimkan OTP melalui MyIM3 API ke nomor tersebut",
                    color: "bg-blue-500",
                  },
                  {
                    step: "2",
                    title: "Verifikasi OTP",
                    desc: "User memasukkan kode OTP yang diterima via SMS untuk mendapatkan access token",
                    color: "bg-orange-500",
                  },
                  {
                    step: "3",
                    title: "Cek Informasi",
                    desc: "Bot menggunakan token untuk mengakses pulsa, kuota, dan masa aktif dari MyIM3 API",
                    color: "bg-green-500",
                  },
                  {
                    step: "4",
                    title: "Laporan Real-time",
                    desc: "Informasi ditampilkan langsung di Telegram dengan format yang mudah dibaca",
                    color: "bg-purple-500",
                  },
                ].map((item) => (
                  <div key={item.step} className="flex gap-3">
                    <div
                      className={`w-7 h-7 ${item.color} rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5`}
                    >
                      {item.step}
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{item.title}</p>
                      <p className="text-gray-400 text-xs mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* API Info */}
            <div className="rounded-2xl bg-gray-900 border border-gray-800 p-6">
              <h2 className="text-lg font-bold text-white mb-4">🔌 API Endpoints</h2>
              <div className="space-y-2">
                {[
                  { method: "POST", path: "/v2/user/otp/send", desc: "Kirim OTP" },
                  { method: "POST", path: "/v2/user/otp/verify", desc: "Verifikasi OTP" },
                  { method: "GET", path: "/v3/user/profile", desc: "Info Profil" },
                  { method: "GET", path: "/v3/user/balance", desc: "Cek Pulsa" },
                  { method: "GET", path: "/v3/user/active-packages", desc: "Paket Aktif" },
                ].map((ep) => (
                  <div
                    key={ep.path}
                    className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/50"
                  >
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded font-mono ${
                        ep.method === "GET"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-blue-500/20 text-blue-400"
                      }`}
                    >
                      {ep.method}
                    </span>
                    <div className="min-w-0">
                      <code className="text-gray-300 text-xs block truncate">
                        {ep.path}
                      </code>
                      <p className="text-gray-500 text-xs">{ep.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-gray-600 text-xs mt-3">
                Base: myim3app.indosatooredoo.com/api
              </p>
            </div>

            {/* Activity Log */}
            {status?.stats.recentActivity && status.stats.recentActivity.length > 0 && (
              <div className="rounded-2xl bg-gray-900 border border-gray-800 p-6">
                <h2 className="text-lg font-bold text-white mb-4">🕐 Aktivitas Terbaru</h2>
                <div className="space-y-2">
                  {status.stats.recentActivity.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/30"
                    >
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          log.status === "success" ? "bg-green-400" : "bg-red-400"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <code className="text-orange-400 text-xs">{log.command}</code>
                          {log.phoneNumber && (
                            <span className="text-gray-500 text-xs truncate">
                              •{" "}
                              {log.phoneNumber.startsWith("62")
                                ? "0" + log.phoneNumber.slice(2)
                                : log.phoneNumber}
                            </span>
                          )}
                        </div>
                        <p className="text-gray-600 text-xs">
                          {new Date(log.createdAt).toLocaleString("id-ID", {
                            hour: "2-digit",
                            minute: "2-digit",
                            day: "2-digit",
                            month: "short",
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Setup Guide */}
        <div className="mt-8 rounded-2xl bg-gray-900 border border-gray-800 p-6">
          <h2 className="text-xl font-bold text-white mb-6">📚 Panduan Setup Lengkap</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-400 text-xl">
                1️⃣
              </div>
              <h3 className="font-bold text-white">Buat Bot Telegram</h3>
              <ol className="text-gray-400 text-sm space-y-1 list-none">
                <li>→ Buka <code className="text-blue-400">@BotFather</code> di Telegram</li>
                <li>→ Ketik <code className="text-blue-400">/newbot</code></li>
                <li>→ Ikuti instruksi untuk memberi nama bot</li>
                <li>→ Copy token yang diberikan</li>
              </ol>
            </div>
            <div className="space-y-3">
              <div className="w-10 h-10 bg-orange-500/20 rounded-xl flex items-center justify-center text-orange-400 text-xl">
                2️⃣
              </div>
              <h3 className="font-bold text-white">Konfigurasi .env</h3>
              <div className="bg-gray-800 rounded-xl p-3 font-mono text-xs">
                <p className="text-gray-500"># .env</p>
                <p className="text-white">TELEGRAM_BOT_TOKEN=</p>
                <p className="text-orange-400">123456:ABC-DEF...</p>
              </div>
              <p className="text-gray-500 text-xs">
                Restart aplikasi setelah menambah token
              </p>
            </div>
            <div className="space-y-3">
              <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center text-green-400 text-xl">
                3️⃣
              </div>
              <h3 className="font-bold text-white">Set Webhook</h3>
              <p className="text-gray-400 text-sm">
                Setelah bot aktif, klik tombol <strong className="text-orange-400">Set Webhook</strong> di atas untuk menghubungkan bot dengan server ini.
              </p>
              <p className="text-gray-500 text-xs">
                Atau gunakan polling mode dengan menjalankan bot terpisah
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-gray-600 text-sm pb-8">
          <p>
            Bot Cek Indosat IM3 · Powered by MyIM3 API (Reverse Engineering) ·
            Built with Next.js + Grammy.js
          </p>
          <p className="mt-1 text-xs text-gray-700">
            Disclaimer: Bot ini menggunakan API MyIM3 resmi. Tidak menyimpan password atau data sensitif.
            Token disimpan terenkripsi di database.
          </p>
        </div>
      </div>
    </div>
  );
}
