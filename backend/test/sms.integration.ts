import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";

// This file runs in its own process: switch the API to Semaphore mode before it loads,
// and answer Semaphore calls locally so no real text is sent and no credits are used.
process.env.SMS_PROVIDER = "semaphore";
process.env.SEMAPHORE_API_KEY = "synthetic-key-not-real";
const texts: { number: string; code: string }[] = [];
let semaphoreDown = false;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  if (String(url).startsWith("https://api.semaphore.co/")) {
    if (semaphoreDown) return new Response("{}", { status: 500 });
    const body = init!.body as URLSearchParams;
    texts.push({ number: body.get("number")!, code: body.get("code")! });
    return new Response(JSON.stringify([{ message_id: texts.length, status: "Pending", code: Number(body.get("code")) }]), { status: 200 });
  }
  return realFetch(url, init);
}) as typeof fetch;
const { app } = await import("../src/app.ts");
const { prisma } = await import("../src/db.ts");
const { resetSmsAllowanceForTests } = await import("../src/sms.ts");

test("with Semaphore on, codes are texted to the number and never returned to the app", async () => {
  const barangayId = randomUUID();
  const local = `9${randomInt(100_000_000, 1_000_000_000)}`;
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const call = async (path: string, input: unknown, token?: string) => {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(input),
    });
    return { status: response.status, body: await response.json() };
  };
  resetSmsAllowanceForTests();
  try {
    await prisma.barangay.create({ data: { barangayId, barangayCode: `SMS-${barangayId.slice(0, 8)}`, barangayName: "SMS test", city: "Test", province: "Test" } });
    const registered = await call("/auth/register", {
      firstName: "Text", lastName: "Tester", birthDate: "1990-01-01", sex: "female", address: "12 Test Street", barangayId, contactNumber: local,
    });
    assert.equal(registered.status, 201);
    assert.equal(registered.body.data.developmentOtp, undefined, "The code must not reach the app");
    assert.equal(texts.length, 1);
    assert.equal(texts[0].number, `0${local}`);
    const verified = await call("/auth/otp/verify", { contactNumber: local, purpose: "register", code: texts[0].code });
    assert.equal(verified.status, 200);
    const token = verified.body.data.accessToken as string;

    // Email codes are not texted to the phone.
    assert.equal((await call("/beneficiaries/me/email", { email: "text.tester@example.com" }, token)).status, 503);

    // If Semaphore fails, no code is saved, and the person can try again right away.
    semaphoreDown = true;
    const failed = await call("/auth/password/reset/request", { contactNumber: local });
    assert.equal(failed.status, 503);
    assert.equal(failed.body.error.code, "SMS_FAILED");
    semaphoreDown = false;
    const retry = await call("/auth/password/reset/request", { contactNumber: local });
    assert.equal(retry.status, 202);
    assert.equal(retry.body.data.developmentOtp, undefined);
    const reset = await call("/auth/password/reset", { contactNumber: local, code: texts.at(-1)!.code, newPassword: "Texted2026x" });
    assert.equal(reset.status, 200);

    // One network cannot request codes without limit (5 per 10 minutes, counting the ones above).
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      await prisma.otpChallenge.deleteMany({ where: { beneficiary: { contactNumber: `+63${local}` } } }); // Skip the one-minute wait.
      statuses.push((await call("/auth/password/reset/request", { contactNumber: local })).status);
    }
    assert.ok(statuses.includes(429), `Expected a limit, got ${statuses.join(",")}`);
  } finally {
    server.close();
    globalThis.fetch = realFetch;
    await prisma.beneficiary.deleteMany({ where: { contactNumber: `+63${local}` } });
    await prisma.barangay.deleteMany({ where: { barangayId } });
  }
});
