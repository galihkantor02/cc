import { NextResponse } from "next/server";
import { db } from "@/db";
import { botUsers, im3Accounts, activityLog } from "@/db/schema";
import { sql, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    let botInfo = null;
    if (token) {
      try {
        const res = await fetch(
          `https://api.telegram.org/bot${token}/getMe`
        );
        const data = await res.json();
        if (data.ok) {
          botInfo = data.result;
        }
      } catch {
        // ignore
      }
    }

    // Get stats from DB
    const [totalUsers] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(botUsers);

    const [totalAccounts] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(im3Accounts);

    const recentActivity = await db
      .select()
      .from(activityLog)
      .orderBy(desc(activityLog.createdAt))
      .limit(10);

    return NextResponse.json({
      status: "ok",
      botConfigured: !!token,
      botInfo,
      stats: {
        totalUsers: totalUsers?.count || 0,
        totalAccounts: totalAccounts?.count || 0,
        recentActivity,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        error: String(err),
      },
      { status: 500 }
    );
  }
}
