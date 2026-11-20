import type { Request } from "express";
import { ApiError } from "./errors.ts";

// Verification codes by SMS through Semaphore (https://semaphore.co/docs).
// SMS_PROVIDER=semaphore turns it on; otherwise codes stay in development mode (shown on screen).
// The API key lives only in the server environment (Railway variables), never in the app.

export type SmsSettings = { provider: "development" | "semaphore"; apiKey?: string; senderName?: string; dailyLimit: number };

export function readSmsSettings(env: NodeJS.ProcessEnv = process.env): SmsSettings {
  const provider = env.SMS_PROVIDER?.trim().toLowerCase();
  if (provider && provider !== "semaphore" && provider !== "development") throw new Error("SMS_PROVIDER must be semaphore or development.");
  const apiKey = env.SEMAPHORE_API_KEY?.trim();
  if (provider === "semaphore" && !apiKey) throw new Error("SMS_PROVIDER=semaphore requires SEMAPHORE_API_KEY.");
  const senderName = env.SEMAPHORE_SENDER_NAME?.trim() || undefined;
  if (senderName && !/^[A-Za-z0-9 ]{1,11}$/.test(senderName)) throw new Error("SEMAPHORE_SENDER_NAME must be the approved sender name (up to 11 letters or numbers).");
  const dailyLimit = Number(env.SMS_DAILY_LIMIT ?? 300);
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1) throw new Error("SMS_DAILY_LIMIT must be a positive whole number.");
  return { provider: provider === "semaphore" ? "semaphore" : "development", apiKey, senderName, dailyLimit };
}

// One SMS (160 characters with the code), no links, and must not start with "TEST" (Semaphore drops those).
export const OTP_MESSAGE = "GarantiyAid: Your One-Time Password (OTP) is {otp}. This code is valid for 5 minutes. For your security, do not share this code with anyone, including staff.";

/** Semaphore's error text without the API key, phone numbers or codes, shortened for the log. */
export function providerReason(raw: string, apiKey?: string) {
  let text = raw.replace(/\s+/g, " ").trim();
  if (apiKey) text = text.split(apiKey).join("[key]");
  text = text.replace(/\d{4,}/g, "[number]");
  return (text || "(empty reply)").slice(0, 300);
}

/** Semaphore takes local 09XXXXXXXXX numbers; accounts store +639XXXXXXXXX. */
export function semaphoreNumber(contactNumber: string) {
  const match = /^\+63(9\d{9})$/.exec(contactNumber);
  if (!match) throw new ApiError(422, "INVALID_PHONE", "Enter a valid Philippine mobile number.");
  return `0${match[1]}`;
}

/**
 * Sends a verification code through Semaphore's OTP route (priority delivery, 2 credits per SMS).
 * Returns the code Semaphore actually sent, so the server stores the hash of what the person receives.
 */
export async function sendOtpSms(settings: SmsSettings, contactNumber: string, code: string, send: typeof fetch = fetch): Promise<string> {
  if (settings.provider !== "semaphore" || !settings.apiKey) throw new Error("SMS_NOT_CONFIGURED");
  const body = new URLSearchParams({ apikey: settings.apiKey, number: semaphoreNumber(contactNumber), message: OTP_MESSAGE, code });
  if (settings.senderName) body.set("sendername", settings.senderName);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await send("https://api.semaphore.co/api/v4/otp", {
      method: "POST", body, signal: controller.signal, redirect: "error",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const raw = await response.text().catch(() => "");
    let data: unknown = null;
    try { data = JSON.parse(raw); } catch { /* Not JSON; logged below. */ }
    const first = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
    const status = typeof first?.status === "string" ? first.status.toLowerCase() : "";
    if (!response.ok || !first || status === "failed" || status === "refunded") {
      // Log Semaphore's reason so the account setup can be fixed, with the key, numbers and codes removed.
      console.error(`Semaphore did not accept the SMS (HTTP ${response.status}${status ? `, ${status}` : ""}): ${providerReason(raw, settings.apiKey)}`);
      throw new Error("SMS_REJECTED");
    }
    const sent = String(first.code ?? code);
    if (!/^\d{6}$/.test(sent)) {
      console.error("Semaphore returned an unexpected code format.");
      throw new Error("SMS_REJECTED");
    }
    return sent;
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "SMS_REJECTED") console.error("Semaphore request failed:", error instanceof Error ? error.name : "unknown");
    throw new ApiError(503, "SMS_FAILED", "We could not send the text message. Please try again in a minute.");
  } finally {
    clearTimeout(timer);
  }
}

// Limits so nobody can drain the SMS credits by requesting codes for many numbers.
const PER_IP = { max: 5, windowMs: 10 * 60 * 1000 };
const byIp = new Map<string, number[]>();
let today = "";
let sentToday = 0;

export function checkSmsAllowance(req: Request, settings: SmsSettings, now = Date.now()) {
  if (settings.provider !== "semaphore") return;
  const ip = req.ip || "unknown";
  const recent = (byIp.get(ip) ?? []).filter((at) => now - at < PER_IP.windowMs);
  if (recent.length >= PER_IP.max) {
    throw new ApiError(429, "TOO_MANY_CODES", "Too many codes were requested from this network. Wait 10 minutes and try again.");
  }
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(now);
  if (day !== today) { today = day; sentToday = 0; }
  if (sentToday >= settings.dailyLimit) {
    console.error(`SMS daily limit of ${settings.dailyLimit} reached; codes are paused until tomorrow.`);
    throw new ApiError(503, "SMS_DAILY_LIMIT", "Text messages are paused for today. Please try again tomorrow or contact staff.");
  }
  recent.push(now);
  byIp.set(ip, recent);
  sentToday++;
}

export function resetSmsAllowanceForTests() { byIp.clear(); today = ""; sentToday = 0; }
