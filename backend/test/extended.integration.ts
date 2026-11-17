import assert from "node:assert/strict";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import { app } from "../src/app.ts";
import { prisma } from "../src/db.ts";

const fakeJpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(2048)]).toString("base64");

test("password, email, simulated wallet, simulated face and assistant history work end to end", async () => {
  const barangayId = randomUUID();
  const phones = [0, 1].map(() => `+639${randomInt(100_000_000, 1_000_000_000)}`);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const call = async (path: string, method = "GET", input?: unknown, token?: string) => {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json() };
  };
  // Signs a seeded account in through the existing OTP flow.
  const signIn = async (contactNumber: string) => {
    const otp = await call("/auth/otp/request", "POST", { contactNumber, purpose: "login" });
    const verified = await call("/auth/otp/verify", "POST", { contactNumber, purpose: "login", code: otp.body.data.developmentOtp });
    return verified.body.data.accessToken as string;
  };
  try {
    await prisma.barangay.create({ data: { barangayId, barangayCode: `EXT-${barangayId.slice(0, 8)}`, barangayName: "Extended test", city: "Test", province: "Test" } });
    for (const [index, contactNumber] of phones.entries()) {
      await prisma.beneficiary.create({ data: {
        barangayId, firstName: index ? "Recipient" : "Owner", lastName: "Tester", contactNumber,
        birthDate: new Date("1990-01-01T00:00:00Z"), sex: "female", address: "12 Test Street", isVerified: true, status: "active",
      } });
    }
    const [owner, recipient] = [await signIn(phones[0]), await signIn(phones[1])];

    // Password: weak passwords rejected, first set needs no current password, then login and change.
    assert.equal((await call("/beneficiaries/me/password", "PUT", { newPassword: "short" }, owner)).status, 422);
    const set = await call("/beneficiaries/me/password", "PUT", { newPassword: "Garantiy2026" }, owner);
    assert.equal(set.status, 200);
    assert.equal(set.body.data.hasPassword, true);
    assert.equal((await call("/auth/password/login", "POST", { contactNumber: phones[0], password: "wrong-pass1" })).status, 401);
    const login = await call("/auth/password/login", "POST", { contactNumber: phones[0], password: "Garantiy2026" });
    assert.equal(login.status, 200);
    assert.ok(login.body.data.accessToken);
    assert.equal((await call("/beneficiaries/me/password", "PUT", { currentPassword: "nope12345", newPassword: "NewPass2026" }, owner)).status, 400);
    assert.equal((await call("/beneficiaries/me/password", "PUT", { currentPassword: "Garantiy2026", newPassword: "NewPass2026" }, owner)).status, 200);
    // Changing the password signs out other sessions.
    assert.equal((await call("/beneficiaries/me", "GET", undefined, login.body.data.accessToken)).status, 401);

    // Reset: an OTP is required and resets revoke every session.
    const reset = await call("/auth/password/reset/request", "POST", { contactNumber: phones[0] });
    assert.equal(reset.status, 202);
    const wrongCode = reset.body.data.developmentOtp === "000000" ? "111111" : "000000";
    assert.equal((await call("/auth/password/reset", "POST", { contactNumber: phones[0], code: wrongCode, newPassword: "Reset2026x" })).status, 400);
    const resetDone = await call("/auth/password/reset", "POST", { contactNumber: phones[0], code: reset.body.data.developmentOtp, newPassword: "Reset2026x" });
    assert.equal(resetDone.status, 200);
    assert.equal((await call("/beneficiaries/me", "GET", undefined, owner)).status, 401);
    const relogin = await call("/auth/password/login", "POST", { contactNumber: phones[0], password: "Reset2026x" });
    assert.equal(relogin.status, 200);
    const token = relogin.body.data.accessToken as string;

    // Email: code is bound to the address that requested it.
    const email = `owner-${randomUUID().slice(0, 8)}@example.com`;
    const emailOtp = await call("/beneficiaries/me/email", "POST", { email }, token);
    assert.equal(emailOtp.status, 202);
    assert.equal((await call("/beneficiaries/me/email/verify", "POST", { email: "other@example.com", code: emailOtp.body.data.developmentOtp }, token)).status, 400);
    assert.equal((await call("/beneficiaries/me/email", "POST", { email }, token)).status, 429, "resend waits one minute");
    const verified = await call("/beneficiaries/me/email/verify", "POST", { email, code: emailOtp.body.data.developmentOtp }, token);
    assert.equal(verified.status, 200);
    assert.equal(verified.body.data.email, email);

    // Wallet: create, simulated credit (idempotent), transfer with balance checks.
    assert.equal((await call("/beneficiaries/me/wallet/simulated-credits", "POST", { amount: 100, requestId: randomUUID() }, token)).status, 404);
    const created = await call("/beneficiaries/me/wallet", "POST", {}, token);
    assert.equal(created.status, 201);
    assert.match(created.body.data.wallet.walletNumber, /^GA-[0-9A-F]{8}$/);
    assert.equal((await call("/beneficiaries/me/wallet", "POST", {}, token)).body.data.created, false);
    const recipientWallet = (await call("/beneficiaries/me/wallet", "POST", {}, recipient)).body.data.wallet.walletNumber;
    const requestId = randomUUID();
    assert.equal((await call("/beneficiaries/me/wallet/simulated-credits", "POST", { amount: 9999, requestId: randomUUID() }, token)).status, 422);
    const credit = await call("/beneficiaries/me/wallet/simulated-credits", "POST", { amount: 500, requestId }, token);
    assert.equal(credit.status, 201);
    assert.equal(credit.body.data.wallet.balance, 500);
    assert.equal((await call("/beneficiaries/me/wallet/simulated-credits", "POST", { amount: 500, requestId }, token)).body.data.wallet.balance, 500);
    const lookup = await call(`/beneficiaries/me/wallet/recipients/${recipientWallet}`, "GET", undefined, token);
    assert.equal(lookup.status, 200);
    assert.equal(lookup.body.data.displayName, "R*** T.");
    assert.equal((await call(`/beneficiaries/me/wallet/recipients/${created.body.data.wallet.walletNumber}`, "GET", undefined, token)).status, 422);
    assert.equal((await call("/beneficiaries/me/wallet/simulated-transfers", "POST", { recipientWalletNumber: recipientWallet, amount: 900, requestId: randomUUID() }, token)).status, 422);
    const transferId = randomUUID();
    const transfer = await call("/beneficiaries/me/wallet/simulated-transfers", "POST", { recipientWalletNumber: recipientWallet, amount: 200, requestId: transferId, note: "Test" }, token);
    assert.equal(transfer.status, 201);
    assert.equal(transfer.body.data.wallet.balance, 300);
    assert.equal(transfer.body.data.transaction.amount, -200);
    await call("/beneficiaries/me/wallet/simulated-transfers", "POST", { recipientWalletNumber: recipientWallet, amount: 200, requestId: transferId }, token);
    const recipientView = (await call("/beneficiaries/me/wallet", "GET", undefined, recipient)).body.data;
    assert.equal(recipientView.wallet.balance, 200, "a retried transfer is applied once");
    assert.equal(recipientView.transactions[0].type, "simulated_transfer_in");
    assert.equal(recipientView.transactions[0].program, null);
    const ownerView = (await call("/beneficiaries/me/wallet", "GET", undefined, token)).body.data;
    assert.deepEqual(ownerView.transactions.map((item: { type: string }) => item.type).sort(), ["simulated_credit", "simulated_transfer_out"]);

    // Face: challenge ownership/replay controls; a demo capture never verifies identity/liveness.
    assert.equal((await call("/beneficiaries/me/biometrics/enrollment", "POST", { frames: [fakeJpeg(), fakeJpeg(), fakeJpeg()] }, token)).status, 403);
    const overview = (await call("/beneficiaries/me/biometrics", "GET", undefined, token)).body.data;
    assert.equal(overview.processorMode, "simulated");
    const consent = await call("/beneficiaries/me/biometric-consents", "POST", { consentVersion: overview.policy.version, retentionUntil: overview.policy.retentionUntil, expectedConsentId: null }, token);
    assert.equal(consent.status, 201);
    const same = fakeJpeg();
    const challenge = async (purpose: string, bearer = token) => (await call('/beneficiaries/me/biometrics/challenge', 'POST', { purpose }, bearer)).body.data;
    const initial = await challenge('enroll');
    assert.equal((await call("/beneficiaries/me/biometrics/enrollment", "POST", { frames: [same, same, same, same], challengeId: initial.id }, token)).status, 422);
    assert.equal((await call("/beneficiaries/me/biometrics/enrollment", "POST", { frames: ["not-an-image", fakeJpeg(), fakeJpeg()] }, token)).status, 422);
    const enrollInput = { frames: [fakeJpeg(), fakeJpeg(), fakeJpeg(), fakeJpeg()], challengeId: (await challenge('enroll')).id };
    const enrolled = await call("/beneficiaries/me/biometrics/enrollment", "POST", enrollInput, token);
    assert.equal(enrolled.status, 201);
    assert.equal(enrolled.body.data.overview.profile.simulated, true);
    assert.equal(enrolled.body.data.liveness.passed, false);
    assert.equal((await call('/beneficiaries/me/biometrics/enrollment', 'POST', enrollInput, token)).status, 409);
    assert.equal((await call('/beneficiaries/me/biometrics/verification', 'POST', { frames: [fakeJpeg(), fakeJpeg(), fakeJpeg()] }, token)).status, 409);
    const verifyInput = { frames: [fakeJpeg(), fakeJpeg(), fakeJpeg()], challengeId: (await challenge('verify')).id };
    const check = await call("/beneficiaries/me/biometrics/verification", "POST", verifyInput, token);
    assert.equal(check.body.data.result, "simulated_capture");
    assert.equal(check.body.data.facesCompared, false);
    assert.equal(check.body.data.livenessPassed, false);
    assert.equal(check.body.data.verifiedAt, null);
    assert.equal(check.body.data.overview.profile.lastVerifiedAt, null);
    assert.equal((await call('/beneficiaries/me/biometrics/verification', 'POST', verifyInput, token)).status, 409);
    const revoke = await call(`/beneficiaries/me/biometric-consents/${consent.body.data.consent.id}/revoke`, "POST", {}, token);
    assert.equal(revoke.body.data.profile.status, "revoked");
    assert.equal((await call("/beneficiaries/me/biometrics/verification", "POST", { frames: [fakeJpeg(), fakeJpeg()] }, token)).status, 403);

    // Assistant history is private to each account.
    assert.equal((await call("/beneficiaries/me/assistant/messages", "POST", { messages: [{ role: "user", text: "When is my claim?" }, { role: "assistant", text: "Saved answer" }] }, token)).status, 201);
    assert.equal((await call("/beneficiaries/me/assistant/messages", "GET", undefined, token)).body.data.length, 2);
    assert.equal((await call("/beneficiaries/me/assistant/messages", "GET", undefined, recipient)).body.data.length, 0);
    assert.equal((await call("/beneficiaries/me/assistant/messages", "DELETE", undefined, token)).status, 204);
    assert.equal((await call("/beneficiaries/me/assistant/messages", "GET", undefined, token)).body.data.length, 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    const owners = await prisma.beneficiary.findMany({ where: { contactNumber: { in: phones } }, select: { beneficiaryId: true } });
    const ids = owners.map((item) => item.beneficiaryId);
    await prisma.transaction.deleteMany({ where: { beneficiaryId: { in: ids } } });
    await prisma.beneficiary.deleteMany({ where: { beneficiaryId: { in: ids } } });
    await prisma.barangay.deleteMany({ where: { barangayId } });
    await prisma.$disconnect();
  }
});
