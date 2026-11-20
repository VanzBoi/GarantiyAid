import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import { app } from "../src/app.ts";
import { config } from "../src/config.ts";
import { prisma } from "../src/db.ts";
import { createSessionToken, hashPassword, hashSecret } from "../src/security.ts";

test("staff approve a program, schedule a distribution, scan the QR and record the release in the wallet once", async () => {
  const barangayId = randomUUID();
  const beneficiaryId = randomUUID();
  const username = `scanner-${randomInt(100000, 999999)}`;
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const call = async (path: string, method = "GET", input?: unknown, token?: string) => {
    const response = await fetch(`${base}${path}`, {
      method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    });
    const text = await response.text();
    return { status: response.status, body: text.startsWith("{") ? JSON.parse(text) : text };
  };
  let distributionId = "";
  try {
    await prisma.barangay.create({ data: { barangayId, barangayCode: `ST-${barangayId.slice(0, 8)}`, barangayName: "Staff test", city: "Test", province: "Test" } });
    await prisma.beneficiary.create({ data: {
      beneficiaryId, barangayId, firstName: "Lola", lastName: "Release", contactNumber: `+639${randomInt(100_000_000, 1_000_000_000)}`,
      birthDate: new Date("1950-01-01T00:00:00Z"), sex: "female", address: "12 Test Street", isVerified: true, status: "active",
      validIdType: "senior_citizen", validIdNumber: "OSCA-2024-001234",
    } });
    const beneficiaryToken = createSessionToken();
    await prisma.authSession.create({ data: { beneficiaryId, tokenHash: hashSecret(beneficiaryToken, "session", config.authPepper), expiresAt: new Date(Date.now() + 600_000) } });
    await prisma.staff.create({ data: { username, displayName: "Test Facilitator", passwordHash: await hashPassword("Scanner2026x") } });

    // The page is served from the same API, and staff routes need a staff login.
    const page = await fetch(`${base}/staff`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /GarantiyAid Staff/);
    assert.equal((await call("/staff/api/claims/preview", "POST", { code: "GAI1.x" })).status, 401);
    assert.equal((await call("/staff/api/login", "POST", { username, password: "wrong-password1" })).status, 401);
    // A beneficiary session is not a staff session.
    assert.equal((await call("/staff/api/me", "GET", undefined, beneficiaryToken)).status, 401);
    const staffToken = (await call("/staff/api/login", "POST", { username, password: "Scanner2026x" })).body.data.accessToken as string;

    // The beneficiary chose Social Pension at sign-up; staff approve it.
    assert.equal((await call("/beneficiaries/me/enrollments", "POST", { programCode: "SOCPEN" }, beneficiaryToken)).status, 201);
    const pending = (await call("/staff/api/enrollments?status=pending", "GET", undefined, staffToken)).body.data;
    const request = pending.find((item: { beneficiary: { name: string } }) => item.beneficiary.name === "Lola Release");
    assert.ok(request);
    assert.equal((await call(`/staff/api/enrollments/${request.id}/decision`, "POST", { decision: "approved" }, staffToken)).status, 200);
    assert.equal((await call(`/staff/api/enrollments/${request.id}/decision`, "POST", { decision: "rejected" }, staffToken)).status, 409);

    // A distribution today, in a slot that is open now (Philippine time).
    const nowManila = new Date(Date.now() + 8 * 3600_000);
    const startMinutes = Math.max(0, nowManila.getUTCHours() * 60 + nowManila.getUTCMinutes() - 10);
    const startTime = `${String(Math.floor(startMinutes / 60)).padStart(2, "0")}:${String(startMinutes % 60).padStart(2, "0")}`;
    const program = (await call("/staff/api/programs", "GET", undefined, staffToken)).body.data.find((p: { code: string }) => p.code === "SOCPEN");
    assert.ok(program.approved >= 1);
    const created = await call("/staff/api/distributions", "POST", {
      programId: program.id, title: "Test social pension payout", location: "Test covered court",
      date: nowManila.toISOString().slice(0, 10), startTime, slotMinutes: 60, perSlot: 200, amount: 1000,
    }, staffToken);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    distributionId = created.body.data.id;

    // The beneficiary opens the QR claim pass; staff scan it.
    const pass = await call("/beneficiaries/me/claim-pass", "POST", {}, beneficiaryToken);
    assert.equal(pass.status, 201);
    const code = pass.body.data.claimCode as string;
    assert.equal((await call("/staff/api/claims/preview", "POST", { code: "https://example.com" }, staffToken)).status, 422);
    const preview = (await call("/staff/api/claims/preview", "POST", { code }, staffToken)).body.data;
    assert.equal(preview.status, "ready");
    assert.equal(preview.beneficiary.name, "Lola Release");
    assert.equal(preview.beneficiary.validIdNumberEnding, "1234");
    assert.equal(preview.amount, 1000);

    const released = await call("/staff/api/claims/release", "POST", { code }, staffToken);
    assert.equal(released.status, 200, JSON.stringify(released.body));
    assert.equal(released.body.data.status, "already_released");
    assert.equal(released.body.data.walletBalance, 1000);
    assert.equal(released.body.data.release.releasedBy, "Test Facilitator");
    // Scanning the same pass again never records a second payment.
    assert.equal((await call("/staff/api/claims/release", "POST", { code }, staffToken)).status, 409);
    const again = await Promise.all([1, 2].map(() => call("/staff/api/claims/release", "POST", { code }, staffToken)));
    assert.ok(again.every((r) => r.status === 409));

    // The mobile app shows the record and a notification.
    const wallet = (await call("/beneficiaries/me/wallet", "GET", undefined, beneficiaryToken)).body.data;
    assert.equal(wallet.wallet.balance, 1000);
    const credits = wallet.transactions.filter((t: { type: string }) => t.type === "assistance_credit");
    assert.equal(credits.length, 1);
    assert.equal(credits[0].amount, 1000);
    const notices = (await call("/beneficiaries/me/notifications", "GET", undefined, beneficiaryToken)).body.data;
    assert.ok(notices.some((n: { title: string }) => n.title === "Assistance received"));
    assert.ok(notices.some((n: { title: string }) => n.title === "Program approved"));
  } finally {
    server.close();
    await prisma.beneficiary.deleteMany({ where: { beneficiaryId } });
    if (distributionId) {
      await prisma.claim.deleteMany({ where: { distributionId } });
      await prisma.distribution.deleteMany({ where: { distributionId } });
    }
    await prisma.staff.deleteMany({ where: { username } });
    await prisma.barangay.deleteMany({ where: { barangayId } });
  }
});
