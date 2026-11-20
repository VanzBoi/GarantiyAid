import assert from "node:assert/strict";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import { app } from "../src/app.ts";
import { prisma } from "../src/db.ts";

// Real camera frames are tens of kilobytes each; use that size so body limits are exercised.
const fakeJpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(60_000)]).toString("base64");

test("face login works only on a phone where it was turned on, and a password reset turns it off", async () => {
  const barangayId = randomUUID();
  const contactNumber = `+639${randomInt(100_000_000, 1_000_000_000)}`;
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
  try {
    await prisma.barangay.create({ data: { barangayId, barangayCode: `FL-${barangayId.slice(0, 8)}`, barangayName: "Face login test", city: "Test", province: "Test" } });
    await prisma.beneficiary.create({ data: {
      barangayId, firstName: "Face", lastName: "Tester", contactNumber, birthDate: new Date("1990-01-01T00:00:00Z"),
      sex: "female", address: "12 Test Street", isVerified: true, status: "active",
    } });
    const otp = await call("/auth/otp/request", "POST", { contactNumber, purpose: "login" });
    const token = (await call("/auth/otp/verify", "POST", { contactNumber, purpose: "login", code: otp.body.data.developmentOtp })).body.data.accessToken as string;
    assert.equal((await call("/beneficiaries/me/password", "PUT", { newPassword: "Garantiy2026" }, token)).status, 200);

    // Face login needs a registered face first.
    assert.equal((await call("/beneficiaries/me/face-login", "POST", {}, token)).status, 409);
    const consent = await call("/beneficiaries/me/biometrics", "GET", undefined, token);
    await call("/beneficiaries/me/biometric-consents", "POST", {
      consentVersion: consent.body.data.policy.version, retentionUntil: consent.body.data.policy.retentionUntil, expectedConsentId: null,
    }, token);
    const enroll = (await call("/beneficiaries/me/biometrics/challenge", "POST", { purpose: "enroll" }, token)).body.data;
    assert.equal((await call("/beneficiaries/me/biometrics/enrollment", "POST", { frames: [fakeJpeg(), fakeJpeg(), fakeJpeg(), fakeJpeg()], challengeId: enroll.id }, token)).status, 201);

    const turnedOn = await call("/beneficiaries/me/face-login", "POST", {}, token);
    assert.equal(turnedOn.status, 201);
    const device = { deviceId: turnedOn.body.data.deviceId, deviceSecret: turnedOn.body.data.deviceSecret };
    assert.equal(turnedOn.body.data.simulated, true);
    assert.ok(!JSON.stringify(await prisma.faceLoginDevice.findMany({ where: { deviceId: device.deviceId } })).includes(device.deviceSecret), "Only a hash is stored");

    // A mobile number or a guessed secret is not enough.
    assert.equal((await call("/auth/face-login/challenge", "POST", { deviceId: device.deviceId, deviceSecret: "guess" })).status, 401);
    assert.equal((await call("/auth/face-login/challenge", "POST", { contactNumber })).status, 401);

    const challenge = (await call("/auth/face-login/challenge", "POST", device)).body.data;
    assert.deepEqual(challenge.poses, ["center", "blink"]);
    const same = fakeJpeg();
    assert.equal((await call("/auth/face-login", "POST", { ...device, challengeId: challenge.id, frames: [same, same, same] })).status, 422);
    // The challenge is single use, even after a failed attempt.
    assert.equal((await call("/auth/face-login", "POST", { ...device, challengeId: challenge.id, frames: [fakeJpeg(), fakeJpeg(), fakeJpeg()] })).status, 409);
    const next = (await call("/auth/face-login/challenge", "POST", device)).body.data;
    const login = await call("/auth/face-login", "POST", { ...device, challengeId: next.id, frames: [fakeJpeg(), fakeJpeg(), fakeJpeg()] });
    assert.equal(login.status, 200);
    assert.equal(login.body.data.simulated, true);
    assert.equal((await call("/beneficiaries/me", "GET", undefined, login.body.data.accessToken)).body.data.firstName, "Face");

    // Changing the password on this phone keeps its face login; other phones lose theirs.
    const other = (await call("/beneficiaries/me/face-login", "POST", {}, token)).body.data;
    assert.equal((await call("/beneficiaries/me/password", "PUT", {
      currentPassword: "Garantiy2026", newPassword: "NewPass2026", keepFaceLoginDeviceId: other.deviceId,
    }, token)).status, 200);
    assert.equal((await call("/auth/face-login/challenge", "POST", device)).status, 401);
    assert.equal((await call("/auth/face-login/challenge", "POST", { deviceId: other.deviceId, deviceSecret: other.deviceSecret })).status, 200);

    // Turning it off, or resetting the password (a lost phone), stops face login.
    const reset = await call("/auth/password/reset/request", "POST", { contactNumber });
    assert.equal((await call("/auth/password/reset", "POST", { contactNumber, code: reset.body.data.developmentOtp, newPassword: "Reset2026x" })).status, 200);
    assert.equal((await call("/auth/face-login/challenge", "POST", { deviceId: other.deviceId, deviceSecret: other.deviceSecret })).status, 401);
  } finally {
    server.close();
    await prisma.beneficiary.deleteMany({ where: { contactNumber } });
    await prisma.barangay.deleteMany({ where: { barangayId } });
  }
});
