import { NextRequest, NextResponse } from "next/server";
import { webhookCallback } from "grammy";
import { createBot } from "@/lib/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }
  return createBot(token);
}

export async function POST(req: NextRequest) {
  try {
    const bot = getBot();
    const handleUpdate = webhookCallback(bot, "std/http");
    return await handleUpdate(req);
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Telegram Bot Webhook is running",
    info: "Send POST requests from Telegram to this endpoint",
  });
}
