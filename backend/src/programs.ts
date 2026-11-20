import type { Express, Request } from "express";
import { prisma } from "./db.ts";
import { ApiError } from "./errors.ts";

/**
 * Government assistance programs (mostly DSWD) a beneficiary can say they belong to at sign-up. The mobile app shows the
 * same codes (mobile/src/programs.ts). A self-reported program is only a pending request:
 * staff confirm membership before any schedule or claim is created.
 */
export const DSWD_PROGRAMS = [
  { code: "4PS", name: "Pantawid Pamilyang Pilipino Program", type: "Conditional cash transfer" },
  { code: "SOCPEN", name: "Social Pension for Indigent Senior Citizens", type: "Social pension" },
  { code: "AICS", name: "Assistance to Individuals in Crisis Situation", type: "Crisis assistance" },
  { code: "AKAP", name: "Ayuda para sa Kapos ang Kita Program", type: "Cash assistance" },
  { code: "SLP", name: "Sustainable Livelihood Program", type: "Livelihood" },
  { code: "WALANG_GUTOM", name: "Walang Gutom Program (Food Stamp)", type: "Food assistance" },
  { code: "SFP", name: "Supplementary Feeding Program", type: "Nutrition" },
  { code: "KALAHI", name: "KALAHI-CIDSS", type: "Community-driven development" },
  { code: "CFW", name: "Cash-for-Work / Project LAWA at BINHI", type: "Cash for work" },
  { code: "DRRM", name: "Disaster Response and Family Food Packs", type: "Disaster response" },
  { code: "ECT", name: "Emergency Cash Transfer", type: "Disaster response" },
  { code: "UCT", name: "Unconditional / Targeted Cash Transfer", type: "Cash transfer" },
  { code: "CENTENARIAN", name: "Expanded Centenarians Act Cash Gift", type: "Senior citizen benefit" },
  { code: "TARA_BASA", name: "Tara, Basa! Tutoring Program", type: "Education support" },
  // Run by DOLE, not DSWD, but many beneficiaries receive it alongside DSWD aid.
  { code: "TUPAD", name: "TUPAD – Tulong Panghanapbuhay sa Ating Disadvantaged/Displaced Workers (DOLE)", type: "Emergency employment" },
  { code: "PAG_ABOT", name: "Pag-abot Program", type: "Reach-out and reintegration" },
  { code: "OTHER", name: "Other DSWD program", type: "Other" },
] as const;

const MAX_SELF_REPORTED = 3;
const programByCode = new Map<string, (typeof DSWD_PROGRAMS)[number]>(DSWD_PROGRAMS.map((program) => [program.code, program]));

function invalid(field: string, message: string) {
  return new ApiError(422, "VALIDATION_ERROR", "Please correct the highlighted fields.", { [field]: message });
}

export function parseProgramRequest(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "INVALID_BODY", "Request body must be a JSON object.");
  }
  const body = value as Record<string, unknown>;
  const code = typeof body.programCode === "string" ? body.programCode.trim().toUpperCase() : "";
  if (!programByCode.has(code)) throw invalid("programCode", "Choose a listed program.");
  const text = (field: string, max: number, pattern: RegExp) => {
    const raw = body[field];
    if (raw === undefined || raw === null || raw === "") return null;
    if (typeof raw !== "string") throw invalid(field, "Enter text.");
    const cleaned = raw.trim().replace(/\s+/g, " ");
    if (!cleaned) return null;
    if (cleaned.length > max || !pattern.test(cleaned)) throw invalid(field, `Use up to ${max} letters, numbers and simple punctuation.`);
    return cleaned;
  };
  const otherProgramName = text("otherProgramName", 120, /^[\p{L}\p{M}\d][\p{L}\p{M}\d .,'()&/-]*$/u);
  const memberReference = text("memberReference", 40, /^[A-Za-z0-9][A-Za-z0-9 -]*$/);
  if (code === "OTHER" && (!otherProgramName || (otherProgramName.match(/\p{L}/gu)?.length ?? 0) < 3)) {
    throw invalid("otherProgramName", "Type the name of the program.");
  }
  return { code, otherProgramName: code === "OTHER" ? otherProgramName : null, memberReference: memberReference?.toUpperCase() ?? null };
}

type Helpers = { requireBeneficiary: (req: Request) => Promise<{ beneficiary: { beneficiaryId: string } }> };

export function registerProgramRoutes(app: Express, { requireBeneficiary }: Helpers) {
  app.get("/programs", (_req, res) => {
    res.json({ data: DSWD_PROGRAMS.map(({ code, name, type }) => ({ code, name, type })) });
  });

  // Saves the program the beneficiary says they belong to, as a pending request for staff review.
  app.post("/beneficiaries/me/enrollments", async (req, res) => {
    const { beneficiary } = await requireBeneficiary(req);
    const input = parseProgramRequest(req.body);
    const catalog = programByCode.get(input.code)!;
    const program = await prisma.program.upsert({
      where: { programCode: catalog.code },
      update: {},
      create: { programCode: catalog.code, programName: catalog.name, programType: catalog.type, grantAmount: null },
    });
    const existing = await prisma.enrollment.findUnique({
      where: { beneficiaryId_programId: { beneficiaryId: beneficiary.beneficiaryId, programId: program.programId } },
    });
    if (existing) return res.json({ data: { id: existing.enrollmentId, status: existing.status, programCode: catalog.code } });
    const selfReported = await prisma.enrollment.count({ where: { beneficiaryId: beneficiary.beneficiaryId, source: "mobile" } });
    if (selfReported >= MAX_SELF_REPORTED) {
      throw new ApiError(409, "PROGRAM_LIMIT_REACHED", "Contact staff to add more programs to your account.");
    }
    const enrollment = await prisma.enrollment.create({
      data: {
        beneficiaryId: beneficiary.beneficiaryId, programId: program.programId, status: "pending", source: "mobile",
        requestedProgramName: input.otherProgramName, memberReference: input.memberReference,
      },
    });
    res.status(201).json({ data: { id: enrollment.enrollmentId, status: enrollment.status, programCode: catalog.code } });
  });
}
