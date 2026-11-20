import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { app } from "../src/app.ts";
import { registerAssistantRoutes } from "../src/assistant.ts";
import { config } from "../src/config.ts";
import { prisma } from "../src/db.ts";
import { ApiError } from "../src/errors.ts";
import { createSessionToken, hashSecret } from "../src/security.ts";

async function listen(server: express.Express) {
  const running = server.listen(0, "127.0.0.1");
  await once(running, "listening");
  const address = running.address();
  assert.ok(address && typeof address !== "string");
  return { running, url: `http://127.0.0.1:${address.port}` };
}

test("beneficiaries report a DSWD program as a pending request and the assistant answers from their record", async () => {
  const barangayId = randomUUID();
  const beneficiaryId = randomUUID();
  const { running, url } = await listen(app);
  // The assistant route runs on its own app with a stand-in Claude client, so no API call is made.
  const sent: Record<string, unknown>[] = [];
  const fakeClient = { beta: { messages: { create: async (body: Record<string, unknown>) => {
    sent.push(body);
    return { model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: "Ang imong iskedyul kay Disyembre 2." }] };
  } } } };
  const assistantApp = express();
  assistantApp.use(express.json());
  registerAssistantRoutes(assistantApp, { requireBeneficiary: async () => ({ beneficiary: { beneficiaryId } }) }, { client: fakeClient as never });
  assistantApp.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ApiError) return res.status(error.status).json({ error: { code: error.code } });
    res.status(500).json({ error: { code: "INTERNAL" } });
  });
  const assistant = await listen(assistantApp);
  try {
    await prisma.barangay.create({ data: { barangayId, barangayCode: `TEST-${barangayId.slice(0, 8)}`, barangayName: "Program test", city: "Test", province: "Test" } });
    await prisma.beneficiary.create({ data: {
      beneficiaryId, barangayId, firstName: "Lola", lastName: "Programa", contactNumber: `+639${randomInt(100_000_000, 1_000_000_000)}`,
      birthDate: new Date("1950-01-01T00:00:00Z"), sex: "female", address: "12 Test Street", isVerified: true, status: "active",
    } });
    const token = createSessionToken();
    await prisma.authSession.create({ data: { beneficiaryId, tokenHash: hashSecret(token, "session", config.authPepper), expiresAt: new Date(Date.now() + 60_000) } });
    const post = (path: string, body: unknown, base = url) => fetch(`${base}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    });

    const catalog = (await (await fetch(`${url}/programs`)).json()).data;
    assert.ok(catalog.some((program: { code: string }) => program.code === "4PS"));
    assert.ok(catalog.some((program: { code: string }) => program.code === "OTHER"));

    assert.equal((await post("/beneficiaries/me/enrollments", { programCode: "NOT_A_PROGRAM" })).status, 422);
    const created = await post("/beneficiaries/me/enrollments", { programCode: "SOCPEN", memberReference: "osca-1" });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).data.status, "pending");
    // Repeating the same program returns the saved request instead of a duplicate.
    assert.equal((await post("/beneficiaries/me/enrollments", { programCode: "SOCPEN" })).status, 200);
    assert.equal((await post("/beneficiaries/me/enrollments", { programCode: "OTHER", otherProgramName: "Lingap sa Lungsod" })).status, 201);

    const overview = (await (await fetch(`${url}/beneficiaries/me/overview`, { headers: { Authorization: `Bearer ${token}` } })).json()).data;
    const names = overview.enrollments.map((item: { program: { name: string } }) => item.program.name);
    assert.ok(names.includes("Lingap sa Lungsod"));
    assert.ok(overview.enrollments.every((item: { status: string; source: string }) => item.status === "pending" && item.source === "mobile"));
    const saved = await prisma.enrollment.findMany({ where: { beneficiaryId } });
    assert.ok(saved.some((item) => item.memberReference === "OSCA-1"));

    // Without an API key on the main app, the assistant says it is not set up.
    assert.equal((await post("/beneficiaries/me/assistant/reply", { messages: [{ role: "user", text: "Hello" }] })).status, 503);

    const reply = await post("/beneficiaries/me/assistant/reply", {
      language: "bs", messages: [{ role: "user", text: "Unsa akong programa?" }],
    }, assistant.url);
    assert.equal(reply.status, 200);
    assert.equal((await reply.json()).data.text, "Ang imong iskedyul kay Disyembre 2.");
    const request = sent[0] as { model: string; fallbacks: string; system: { text: string }[]; messages: { role: string; content: string }[] };
    assert.equal(request.model, "claude-opus-5-5");
    assert.equal(request.fallbacks, "default");
    assert.ok(request.system[1].text.includes("Lingap sa Lungsod (status: pending"));
    assert.ok(request.system[1].text.includes("Social Pension"));
    assert.ok(!request.system[1].text.includes("12 Test Street"));
    assert.deepEqual(request.messages, [{ role: "user", content: "Unsa akong programa?" }]);
  } finally {
    running.close();
    assistant.running.close();
    await prisma.beneficiary.deleteMany({ where: { beneficiaryId } });
    await prisma.barangay.deleteMany({ where: { barangayId } });
  }
});
