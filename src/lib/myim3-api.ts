/**
 * MyIM3 API Client - Reverse Engineered
 * Based on the MyIM3 web app (myim3app.indosatooredoo.com) API endpoints
 * discovered through network traffic analysis.
 *
 * Flow:
 * 1. sendOtp(phoneNumber) → sends OTP via SMS to the Indosat number
 * 2. verifyOtp(phoneNumber, otp) → verifies OTP, returns access_token
 * 3. getBalance(token) → returns pulsa balance
 * 4. getQuota(token) → returns quota/package details
 * 5. getProfile(token) → returns user profile (name, active period, etc.)
 */

import axios, { AxiosInstance } from "axios";

const BASE_URL = "https://myim3app.indosatooredoo.com/api";
const APP_VERSION = "82.17.0";
const PLATFORM = "web";

// Common headers used across all MyIM3 web app requests
const COMMON_HEADERS = {
  "Content-Type": "application/json",
  "Accept": "application/json",
  "Origin": "https://myim3app.indosatooredoo.com",
  "Referer": "https://myim3app.indosatooredoo.com/",
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  "x-app-version": APP_VERSION,
  "x-platform": PLATFORM,
};

export interface MyIM3OTPResponse {
  success: boolean;
  message: string;
  sessionToken?: string;
  data?: Record<string, unknown>;
}

export interface MyIM3TokenResponse {
  success: boolean;
  message: string;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  data?: Record<string, unknown>;
}

export interface BalanceInfo {
  balance: string;
  balanceFormatted: string;
  currency: string;
}

export interface ActivePackage {
  name: string;
  quota: string;
  quotaRemaining: string;
  quotaUnit: string;
  validUntil: string;
  type: string;
}

export interface ProfileInfo {
  name: string;
  phoneNumber: string;
  accountType: string; // prepaid / postpaid
  activeUntil: string;
  status: string;
}

export interface FullAccountInfo {
  profile: ProfileInfo;
  balance: BalanceInfo;
  packages: ActivePackage[];
  rawData: Record<string, unknown>;
}

class MyIM3ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      headers: COMMON_HEADERS,
      timeout: 30000,
    });
  }

  /**
   * Step 1: Request OTP to be sent to phone number via SMS
   */
  async sendOtp(phoneNumber: string): Promise<MyIM3OTPResponse> {
    const normalizedPhone = this.normalizePhone(phoneNumber);

    try {
      const response = await this.client.post("/v2/user/otp/send", {
        phone_number: normalizedPhone,
        channel: "sms",
        platform: PLATFORM,
      });

      const data = response.data;

      if (data?.meta?.status === "success" || data?.status === "success" || response.status === 200) {
        return {
          success: true,
          message: "OTP berhasil dikirim ke nomor " + phoneNumber,
          sessionToken: data?.data?.session_token || data?.session_token,
          data: data,
        };
      }

      return {
        success: false,
        message: data?.meta?.message || data?.message || "Gagal mengirim OTP",
        data: data,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errData = error.response?.data;
        // If 422, phone might already have pending OTP or is not Indosat
        if (error.response?.status === 422 || error.response?.status === 400) {
          return {
            success: false,
            message:
              errData?.meta?.message ||
              errData?.message ||
              "Nomor tidak valid atau bukan kartu Indosat IM3",
          };
        }
        if (error.response?.status === 429) {
          return {
            success: false,
            message: "Terlalu banyak permintaan OTP. Coba lagi beberapa menit.",
          };
        }
      }
      throw error;
    }
  }

  /**
   * Step 2: Verify OTP and obtain access token
   */
  async verifyOtp(
    phoneNumber: string,
    otp: string,
    sessionToken?: string
  ): Promise<MyIM3TokenResponse> {
    const normalizedPhone = this.normalizePhone(phoneNumber);

    try {
      const payload: Record<string, string> = {
        phone_number: normalizedPhone,
        otp: otp.trim(),
        platform: PLATFORM,
      };

      if (sessionToken) {
        payload.session_token = sessionToken;
      }

      const response = await this.client.post("/v2/user/otp/verify", payload);
      const data = response.data;

      const token =
        data?.data?.access_token ||
        data?.access_token ||
        data?.data?.token ||
        data?.token;

      const refreshToken =
        data?.data?.refresh_token || data?.refresh_token;

      if (token) {
        return {
          success: true,
          message: "Login berhasil!",
          accessToken: token,
          refreshToken: refreshToken,
          expiresIn: data?.data?.expires_in || 3600 * 24,
          data: data,
        };
      }

      return {
        success: false,
        message: data?.meta?.message || data?.message || "OTP tidak valid",
        data: data,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errData = error.response?.data;
        if (error.response?.status === 401 || error.response?.status === 422) {
          return {
            success: false,
            message:
              errData?.meta?.message ||
              errData?.message ||
              "OTP salah atau sudah kadaluarsa",
          };
        }
      }
      throw error;
    }
  }

  /**
   * Get user profile, balance, and active packages in one call
   */
  async getFullAccountInfo(
    accessToken: string,
    phoneNumber: string
  ): Promise<FullAccountInfo> {
    const normalizedPhone = this.normalizePhone(phoneNumber);
    const authHeaders = {
      Authorization: `Bearer ${accessToken}`,
      "x-msisdn": normalizedPhone,
    };

    // Fetch all data in parallel
    const [profileRes, balanceRes, quotaRes] = await Promise.allSettled([
      this.client.get("/v3/user/profile", { headers: authHeaders }),
      this.client.get("/v3/user/balance", { headers: authHeaders }),
      this.client.get("/v3/user/active-packages", { headers: authHeaders }),
    ]);

    const rawData: Record<string, unknown> = {};

    // Parse profile
    let profile: ProfileInfo = {
      name: "Pelanggan IM3",
      phoneNumber: phoneNumber,
      accountType: "Prabayar",
      activeUntil: "-",
      status: "Aktif",
    };

    if (profileRes.status === "fulfilled") {
      const pData = profileRes.value.data;
      rawData.profile = pData;
      const p = pData?.data || pData;
      profile = {
        name: p?.name || p?.customer_name || p?.full_name || "Pelanggan IM3",
        phoneNumber: phoneNumber,
        accountType:
          p?.account_type === "postpaid"
            ? "Pascabayar"
            : "Prabayar",
        activeUntil:
          p?.active_until ||
          p?.expired_date ||
          p?.validity_date ||
          p?.expiry_date ||
          "-",
        status: p?.status || "Aktif",
      };
    }

    // Parse balance
    let balance: BalanceInfo = {
      balance: "0",
      balanceFormatted: "Rp 0",
      currency: "IDR",
    };

    if (balanceRes.status === "fulfilled") {
      const bData = balanceRes.value.data;
      rawData.balance = bData;
      const b = bData?.data || bData;
      const rawBalance =
        b?.balance ||
        b?.credit ||
        b?.main_balance ||
        b?.prepaid_balance ||
        "0";
      const numBalance = parseInt(String(rawBalance).replace(/\D/g, ""), 10) || 0;
      balance = {
        balance: String(rawBalance),
        balanceFormatted: `Rp ${numBalance.toLocaleString("id-ID")}`,
        currency: "IDR",
      };
    }

    // Parse active packages
    let packages: ActivePackage[] = [];

    if (quotaRes.status === "fulfilled") {
      const qData = quotaRes.value.data;
      rawData.quota = qData;
      const items = qData?.data?.items || qData?.data || qData?.items || qData || [];
      const itemsArr = Array.isArray(items) ? items : [items];

      packages = itemsArr
        .filter(Boolean)
        .map((item: Record<string, unknown>) => {
          const remaining =
            (item?.remaining_quota as string) ||
            (item?.remaining as string) ||
            (item?.sisa_kuota as string) ||
            (item?.quota_remaining as string) ||
            "0";
          const total =
            (item?.total_quota as string) ||
            (item?.total as string) ||
            (item?.quota as string) ||
            (item?.quota_total as string) ||
            "0";
          const unit =
            (item?.unit as string) ||
            (item?.quota_unit as string) ||
            "MB";

          return {
            name:
              (item?.package_name as string) ||
              (item?.name as string) ||
              (item?.product_name as string) ||
              "Paket Data",
            quota: `${total} ${unit}`,
            quotaRemaining: `${remaining} ${unit}`,
            quotaUnit: unit,
            validUntil:
              (item?.expired_date as string) ||
              (item?.valid_until as string) ||
              (item?.expiry_date as string) ||
              "-",
            type:
              (item?.type as string) ||
              (item?.package_type as string) ||
              "data",
          };
        });
    }

    return {
      profile,
      balance,
      packages,
      rawData,
    };
  }

  /**
   * Get balance only
   */
  async getBalance(accessToken: string, phoneNumber: string): Promise<BalanceInfo> {
    const normalizedPhone = this.normalizePhone(phoneNumber);
    const response = await this.client.get("/v3/user/balance", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "x-msisdn": normalizedPhone,
      },
    });
    const data = response.data;
    const b = data?.data || data;
    const rawBalance = b?.balance || b?.credit || b?.main_balance || "0";
    const numBalance = parseInt(String(rawBalance).replace(/\D/g, ""), 10) || 0;
    return {
      balance: String(rawBalance),
      balanceFormatted: `Rp ${numBalance.toLocaleString("id-ID")}`,
      currency: "IDR",
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<MyIM3TokenResponse> {
    try {
      const response = await this.client.post("/v2/user/token/refresh", {
        refresh_token: refreshToken,
      });
      const data = response.data;
      const token = data?.data?.access_token || data?.access_token;

      if (token) {
        return {
          success: true,
          message: "Token diperbarui",
          accessToken: token,
          refreshToken: data?.data?.refresh_token || refreshToken,
          expiresIn: data?.data?.expires_in || 3600 * 24,
        };
      }
      return { success: false, message: "Gagal memperbarui token" };
    } catch {
      return { success: false, message: "Sesi kadaluarsa, silakan login ulang" };
    }
  }

  /**
   * Normalize Indonesian phone number to E.164-ish format
   * 08xxxxxxxxxx → 628xxxxxxxxxx
   */
  normalizePhone(phone: string): string {
    const clean = phone.replace(/\D/g, "");
    if (clean.startsWith("0")) {
      return "62" + clean.slice(1);
    }
    if (clean.startsWith("628")) {
      return clean;
    }
    if (clean.startsWith("8")) {
      return "62" + clean;
    }
    return clean;
  }

  /**
   * Format phone for display
   */
  formatPhoneDisplay(phone: string): string {
    const norm = this.normalizePhone(phone);
    // 628xxx → 08xxx
    if (norm.startsWith("62")) {
      return "0" + norm.slice(2);
    }
    return norm;
  }
}

export const myIM3Api = new MyIM3ApiClient();
