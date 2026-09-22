import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  // Polling is managed by the bot-runner server process
  return NextResponse.json({
    status: "info",
    message:
      "Bot polling is managed by the background process. Check /api/bot/status for bot status.",
  });
}

export async function GET() {
  return NextResponse.json({
    status: "info",
    message: "Use POST to trigger polling management",
  });
}
