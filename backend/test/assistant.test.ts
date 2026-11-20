import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "../src/errors.ts";
import { buildRecordSummary, parseAssistantRequest, replyText } from "../src/assistant.ts";
import { parseProgramRequest } from "../src/programs.ts";

test("program requests accept listed DSWD programs and require a name for Other", () => {
  assert.deepEqual(parseProgramRequest({ programCode: "4ps", memberReference: " 1234-5678 " }), {
    code: "4PS", otherProgramName: null, memberReference: "1234-5678",
  });
  assert.deepEqual(parseProgramRequest({ programCode: "OTHER", otherProgramName: "  Lingap  sa Barangay " }), {
    code: "OTHER", otherProgramName: "Lingap sa Barangay", memberReference: null,
  });
  // A name typed for a listed program is ignored rather than renaming the program.
  assert.equal(parseProgramRequest({ programCode: "SOCPEN", otherProgramName: "Anything" }).otherProgramName, null);
  for (const input of [
    {}, [], { programCode: "UNKNOWN" }, { programCode: "OTHER" }, { programCode: "OTHER", otherProgramName: "12" },
    { programCode: "AICS", memberReference: "<script>" }, { programCode: "AICS", memberReference: "x".repeat(41) },
  ]) assert.throws(() => parseProgramRequest(input), (error) => error instanceof ApiError);
});

test("assistant requests keep the latest turns, start with the person and end with their question", () => {
  const many = Array.from({ length: 25 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", text: `turn ${index}` }));
  const { turns, language } = parseAssistantRequest({ messages: many, language: "en" });
  assert.equal(language, "en");
  assert.equal(turns[0].role, "user");
  assert.equal(turns.at(-1)?.text, "turn 24");
  assert.ok(turns.length <= 20);
  assert.equal(parseAssistantRequest({ messages: [{ role: "user", text: " Kanus-a? " }] }).language, "bs");
  for (const input of [
    {}, { messages: [] }, { messages: [{ role: "assistant", text: "hi" }] }, { messages: [{ role: "system", text: "x" }] },
    { messages: [{ role: "user", text: " " }] }, { messages: [{ role: "user", text: "x".repeat(2001) }] },
  ]) assert.throws(() => parseAssistantRequest(input), (error) => error instanceof ApiError);
});

test("the record summary gives the facts the assistant needs without contact details", () => {
  const summary = buildRecordSummary({
    firstName: "Maria", language: "bs", isVerified: true, hasPassword: false, validIdType: "senior_citizen",
    barangay: { barangayName: "Lahug", city: "Cebu City", province: "Cebu" },
    enrollments: [
      { status: "approved", programName: "Pantawid Pamilyang Pilipino Program", requestedProgramName: null, source: "staff" },
      { status: "pending", programName: "Other DSWD program", requestedProgramName: "Lingap", source: "mobile" },
    ],
    schedules: [{
      slotStart: new Date("2026-12-02T01:00:00Z"), slotEnd: new Date("2026-12-02T02:00:00Z"), queueNumber: 7, status: "scheduled",
      location: "Lahug Covered Court", distributionDate: new Date("2026-12-02T00:00:00Z"), programName: "Pantawid Pamilyang Pilipino Program", claimStatus: null,
    }],
    claims: [], documents: [{ docType: "valid_id", status: "received" }], faceStatus: null,
    now: new Date("2026-11-20T02:00:00Z"),
  });
  for (const fact of ["Maria", "Lahug Covered Court", "queue number 007", "9:00 AM", "Lingap (status: pending, chosen by the beneficiary at sign-up)", "Password set: no", "App language: Bisaya"]) {
    assert.ok(summary.includes(fact), fact);
  }
  assert.ok(!/\+63|contact|address:/i.test(summary));
});

test("only text blocks reach the person", () => {
  assert.equal(replyText([
    { type: "thinking", thinking: "", signature: "x" },
    { type: "text", text: "Maayong ", citations: null },
    { type: "text", text: "buntag!", citations: null },
  ] as never), "Maayong buntag!");
});
