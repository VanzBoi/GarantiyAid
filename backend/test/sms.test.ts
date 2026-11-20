import assert from "node:assert/strict";
import test from "node:test";
import type { Request } from "express";
import { ApiError } from "../src/errors.ts";
import { checkSmsAllowance, OTP_MESSAGE, providerReason, readSmsSettings, resetSmsAllowanceForTests, semaphoreNumber, sendOtpSms } from "../src/sms.ts";

const settings = readSmsSettings({ SMS_PROVIDER: "semaphore", SEMAPHORE_API_KEY: "synthetic-key", SEMAPHORE_SENDER_NAME: "GarantiyAid" });
const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("settings stay in development unless Semaphore is fully configured", () => {
  assert.equal(readSmsSettings({}).provider, "development");
  assert.throws(() => readSmsSettings({ SMS_PROVIDER: "semaphore" }), /SEMAPHORE_API_KEY/);
  assert.throws(() => readSmsSettings({ SMS_PROVIDER: "twilio" }), /SMS_PROVIDER/);
  assert.throws(() => readSmsSettings({ SMS_PROVIDER: "semaphore", SEMAPHORE_API_KEY: "k", SEMAPHORE_SENDER_NAME: "Way Too Long Sender" }), /SENDER_NAME/);
  assert.equal(settings.dailyLimit, 300);
});

test("the text is short, has no link, and is never dropped as a TEST message", () => {
  assert.ok(OTP_MESSAGE.replace("{otp}", "123456").length <= 160, "Must fit one SMS (2 credits)");
  assert.equal(OTP_MESSAGE.replace("{otp}", "123456"), "GarantiyAid: Your One-Time Password (OTP) is 123456. This code is valid for 5 minutes. For your security, do not share this code with anyone, including staff.");
  assert.ok(!/^test/i.test(OTP_MESSAGE));
  assert.ok(!/https?:|www\./i.test(OTP_MESSAGE));
  assert.ok(OTP_MESSAGE.includes("{otp}"));
});

test("numbers are sent in the local 09 format", () => {
  assert.equal(semaphoreNumber("+639171234567"), "09171234567");
  assert.throws(() => semaphoreNumber("+15551234567"), ApiError);
});

test("a code is sent through the OTP route and the code Semaphore sent is the one kept", async () => {
  let seen: { url: string; body: URLSearchParams } | undefined;
  const sent = await sendOtpSms(settings, "+639171234567", "123456", async (url, init) => {
    seen = { url: String(url), body: init!.body as URLSearchParams };
    return reply(200, [{ message_id: 1, status: "Pending", code: 654321 }])();
  });
  assert.equal(sent, "654321");
  assert.equal(seen!.url, "https://api.semaphore.co/api/v4/otp");
  assert.equal(seen!.body.get("apikey"), "synthetic-key");
  assert.equal(seen!.body.get("number"), "09171234567");
  assert.equal(seen!.body.get("code"), "123456");
  assert.equal(seen!.body.get("sendername"), "GarantiyAid");
});

test("rejections, errors and odd replies become one safe message", async () => {
  for (const send of [
    reply(200, [{ status: "Failed" }]), reply(401, { apikey: ["invalid"] }), reply(200, []),
    reply(200, [{ status: "Pending", code: "12ab" }]), async () => { throw new TypeError("network"); },
  ]) {
    await assert.rejects(sendOtpSms(settings, "+639171234567", "123456", send as typeof fetch), (error) => error instanceof ApiError && error.code === "SMS_FAILED");
  }
});

test("per-network and daily limits protect the SMS credits", () => {
  resetSmsAllowanceForTests();
  const from = (ip: string) => ({ ip } as Request);
  for (let i = 0; i < 5; i++) checkSmsAllowance(from("1.1.1.1"), settings, 1000);
  assert.throws(() => checkSmsAllowance(from("1.1.1.1"), settings, 1000), (e) => e instanceof ApiError && e.code === "TOO_MANY_CODES");
  checkSmsAllowance(from("1.1.1.1"), settings, 1000 + 11 * 60_000); // The window moves on.
  resetSmsAllowanceForTests();
  const small = { ...settings, dailyLimit: 2 };
  checkSmsAllowance(from("2.2.2.2"), small, 1000);
  checkSmsAllowance(from("3.3.3.3"), small, 1000);
  assert.throws(() => checkSmsAllowance(from("4.4.4.4"), small, 1000), (e) => e instanceof ApiError && e.code === "SMS_DAILY_LIMIT");
  resetSmsAllowanceForTests();
  checkSmsAllowance(from("5.5.5.5"), { ...settings, provider: "development" }, 1000); // Development mode never counts.
});

test("logged provider reasons never include the key, numbers or codes", () => {
  const reason = providerReason('{"apikey":["synthetic-key is invalid"],"number":["09171234567"],"code":"482913"}', "synthetic-key");
  assert.ok(!reason.includes("synthetic-key"));
  assert.ok(!reason.includes("09171234567"));
  assert.ok(!reason.includes("482913"));
  assert.match(reason, /\[key\] is invalid/);
  assert.equal(providerReason(""), "(empty reply)");
  assert.ok(providerReason("x".repeat(1000)).length <= 300);
});
