import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "TELEGRAM_BOT_TOKEN not configured" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const webhookUrl = body.url || `${req.nextUrl.origin}/api/telegram/webhook`;

    // Set webhook via Telegram API
    const res = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: [
            "message",
            "callback_query",
            "inline_query",
          ],
          drop_pending_updates: true,
        }),
      }
    );

    const data = await res.json();

    if (data.ok) {
      return NextResponse.json({
        success: true,
        message: `Webhook berhasil diset ke: ${webhookUrl}`,
        result: data.result,
        webhookUrl,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: data.description,
        data,
      },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "TELEGRAM_BOT_TOKEN not configured" },
        { status: 400 }
      );
    }

    const res = await fetch(
      `https://api.telegram.org/bot${token}/deleteWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drop_pending_updates: true }),
      }
    );

    const data = await res.json();
    return NextResponse.json({ success: data.ok, data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "TELEGRAM_BOT_TOKEN not configured" },
        { status: 400 }
      );
    }

    const res = await fetch(
      `https://api.telegram.org/bot${token}/getWebhookInfo`
    );
    const data = await res.json();
    return NextResponse.json({ success: data.ok, data: data.result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
