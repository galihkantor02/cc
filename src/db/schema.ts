import { pgTable, text, timestamp, bigint, boolean, integer, jsonb } from "drizzle-orm/pg-core";

// Bot users / Telegram accounts
export const botUsers = pgTable("bot_users", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  telegramId: text("telegram_id").notNull().unique(),
  telegramUsername: text("telegram_username"),
  telegramFirstName: text("telegram_first_name"),
  telegramLastName: text("telegram_last_name"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Indosat IM3 accounts linked to bot users
export const im3Accounts = pgTable("im3_accounts", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  botUserId: bigint("bot_user_id", { mode: "number" }).notNull().references(() => botUsers.id, { onDelete: "cascade" }),
  phoneNumber: text("phone_number").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiry: timestamp("token_expiry"),
  accountName: text("account_name"),
  isActive: boolean("is_active").notNull().default(true),
  isPrimary: boolean("is_primary").notNull().default(false),
  lastSynced: timestamp("last_synced"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// OTP sessions for login flow
export const otpSessions = pgTable("otp_sessions", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  telegramId: text("telegram_id").notNull(),
  phoneNumber: text("phone_number").notNull(),
  sessionToken: text("session_token"),
  status: text("status").notNull().default("pending"), // pending, verified, expired
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Cached account info
export const accountCache = pgTable("account_cache", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  im3AccountId: bigint("im3_account_id", { mode: "number" }).notNull().references(() => im3Accounts.id, { onDelete: "cascade" }),
  balance: text("balance"),
  activeUntil: text("active_until"),
  quota: jsonb("quota"),
  rawData: jsonb("raw_data"),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
});

// Bot activity log
export const activityLog = pgTable("activity_log", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  telegramId: text("telegram_id").notNull(),
  command: text("command").notNull(),
  phoneNumber: text("phone_number"),
  status: text("status").notNull().default("success"),
  details: text("details"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Bot settings / config
export const botSettings = pgTable("bot_settings", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
