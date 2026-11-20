import type { Express, Request } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { config } from "./config.ts";
import { prisma } from "./db.ts";
import { documentStoragePath } from "./documents.ts";
import { ApiError } from "./errors.ts";
import { createSessionToken, hashSecret, passwordMatches, walletNumberFor } from "./security.ts";
import { uuid } from "./validation.ts";

// Distribution-day tools for staff, served at /staff on the same API as the mobile app:
// scan a beneficiary's QR claim pass, check who they are, release the assistance and record it in
// their wallet; approve programs chosen at sign-up; and schedule a distribution.
// The wallet entry is a record of assistance handed over. No real money moves through this API.

const STAFF_SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_AMOUNT = 50_000;
const ID_DOCUMENT_TYPES = ["valid_id", "senior_citizen_id", "pwd_id"];

const manilaDate = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(date);
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
const peso = (amount: number) => `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function body(req: Request): Record<string, unknown> {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) throw new ApiError(400, "INVALID_BODY", "Request body must be a JSON object.");
  return req.body as Record<string, unknown>;
}
function invalid(field: string, message: string) {
  return new ApiError(422, "VALIDATION_ERROR", "Please correct the highlighted fields.", { [field]: message });
}

const loginFailures = new Map<string, { count: number; until: number }>();
function checkLoginLimit(key: string) {
  const entry = loginFailures.get(key);
  if (entry && entry.count >= 5 && entry.until > Date.now()) throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Too many incorrect passwords. Wait 15 minutes.");
}
function recordLoginFailure(key: string) {
  const entry = loginFailures.get(key);
  const fresh = !entry || entry.until <= Date.now();
  loginFailures.set(key, { count: fresh ? 1 : entry.count + 1, until: Date.now() + 15 * 60 * 1000 });
}

export async function requireStaff(req: Request) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new ApiError(401, "STAFF_UNAUTHORIZED", "Log in as staff.");
  const session = await prisma.staffSession.findUnique({
    where: { tokenHash: hashSecret(token, "staff-session", config.authPepper) }, include: { staff: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.staff.isActive) {
    throw new ApiError(401, "STAFF_SESSION_EXPIRED", "Your staff session has ended. Log in again.");
  }
  return { session, staff: session.staff };
}

/** Finds the pass behind a scanned code and everything staff need to decide. */
async function findPass(code: unknown) {
  const claimCode = typeof code === "string" ? code.trim() : "";
  if (!/^GAI1\.[A-Za-z0-9_-]{20,100}$/.test(claimCode)) {
    throw new ApiError(422, "QR_NOT_GARANTIYAID", "This is not a GarantiyAid claim pass.");
  }
  const pass = await prisma.qrToken.findUnique({
    where: { tokenHash: hashSecret(claimCode, "qr", config.authPepper) },
    include: { beneficiary: { include: { barangay: true } }, distribution: { include: { program: true } } },
  });
  if (!pass) throw new ApiError(404, "QR_UNKNOWN", "This claim pass was not found. Ask the beneficiary to reopen their QR pass.");
  const [schedule, claim, idDocument] = await Promise.all([
    prisma.schedule.findFirst({ where: { beneficiaryId: pass.beneficiaryId, distributionId: pass.distributionId } }),
    prisma.claim.findUnique({
      where: { beneficiaryId_distributionId: { beneficiaryId: pass.beneficiaryId, distributionId: pass.distributionId } },
      include: { transaction: true, releasedBy: { select: { displayName: true } } },
    }),
    prisma.beneficiaryDocument.findFirst({
      where: { beneficiaryId: pass.beneficiaryId, docType: { in: ID_DOCUMENT_TYPES }, mimeType: { in: ["image/jpeg", "image/png"] } },
      orderBy: { createdAt: "desc" }, select: { documentId: true },
    }),
  ]);
  const amount = pass.distribution.amount ?? pass.distribution.program.grantAmount;
  const today = manilaDate(new Date());
  const released = claim?.claimStatus === "completed";
  const status = released ? "already_released"
    : pass.distribution.status === "cancelled" ? "cancelled"
      : pass.qrStatus === "revoked" ? "replaced"
        : pass.qrStatus !== "active" ? "used"
          : !schedule ? "not_scheduled"
            : dateOnly(pass.distribution.distributionDate) !== today ? "wrong_day"
              : "ready";
  return { pass, schedule, claim, idDocument, amount: amount == null ? null : Number(amount), status, today };
}

function passView(found: Awaited<ReturnType<typeof findPass>>) {
  const { pass, schedule, claim, idDocument, amount, status } = found;
  const b = pass.beneficiary;
  const number = b.validIdNumber ?? "";
  return {
    status,
    beneficiary: {
      id: b.beneficiaryId,
      name: [b.firstName, b.middleName, b.lastName].filter(Boolean).join(" "),
      birthDate: dateOnly(b.birthDate),
      barangay: `${b.barangay.barangayName}, ${b.barangay.city}`,
      validIdType: b.validIdType,
      // Enough to compare with the card in hand without exposing the full number on screen.
      validIdNumberEnding: number.length > 4 ? number.slice(-4) : number || null,
      idPhoto: idDocument ? `/staff/api/beneficiaries/${b.beneficiaryId}/id-photo` : null,
    },
    distribution: {
      id: pass.distribution.distributionId,
      title: pass.distribution.title,
      date: dateOnly(pass.distribution.distributionDate),
      location: pass.distribution.location,
      program: pass.distribution.program.programName,
    },
    schedule: schedule ? { queueNumber: schedule.queueNumber, slotStart: schedule.slotStart.toISOString(), slotEnd: schedule.slotEnd.toISOString() } : null,
    amount,
    release: claim?.claimStatus === "completed" ? {
      claimedAt: claim.claimedAt?.toISOString() ?? null,
      reference: claim.transaction?.referenceNo ?? null,
      releasedBy: claim.releasedBy?.displayName ?? null,
    } : null,
  };
}

export function registerStaffRoutes(app: Express) {
  const page = fileURLToPath(new URL("../staff/index.html", import.meta.url));
  app.get("/staff", (_req, res) => {
    res.set("Cache-Control", "no-store").set("X-Frame-Options", "DENY").sendFile(page);
  });

  app.post("/staff/api/login", async (req, res) => {
    const input = body(req);
    const username = typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
    const password = typeof input.password === "string" ? input.password : "";
    checkLoginLimit(`staff:${username}`);
    const staff = username ? await prisma.staff.findUnique({ where: { username } }) : null;
    const matches = await passwordMatches(password, staff?.passwordHash ?? null);
    if (!staff || !staff.isActive || !matches) {
      recordLoginFailure(`staff:${username}`);
      throw new ApiError(401, "INVALID_CREDENTIALS", "The username or password is incorrect.");
    }
    loginFailures.delete(`staff:${username}`);
    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + STAFF_SESSION_MS);
    await prisma.$transaction([
      prisma.staffSession.create({ data: { staffId: staff.staffId, tokenHash: hashSecret(token, "staff-session", config.authPepper), expiresAt } }),
      prisma.staff.update({ where: { staffId: staff.staffId }, data: { lastLoginAt: new Date() } }),
    ]);
    res.json({ data: { accessToken: token, expiresAt: expiresAt.toISOString(), staff: { name: staff.displayName, username: staff.username } } });
  });

  app.post("/staff/api/logout", async (req, res) => {
    const { session } = await requireStaff(req);
    await prisma.staffSession.update({ where: { sessionId: session.sessionId }, data: { revokedAt: new Date() } });
    res.status(204).end();
  });

  app.get("/staff/api/me", async (req, res) => {
    const { staff } = await requireStaff(req);
    res.json({ data: { name: staff.displayName, username: staff.username } });
  });

  // ── Scan and release ──
  app.post("/staff/api/claims/preview", async (req, res) => {
    await requireStaff(req);
    res.set("Cache-Control", "no-store").json({ data: passView(await findPass(body(req).code)) });
  });

  app.post("/staff/api/claims/release", async (req, res) => {
    const { staff } = await requireStaff(req);
    const input = body(req);
    const found = await findPass(input.code);
    if (found.status === "already_released") {
      throw new ApiError(409, "ALREADY_RELEASED", "This assistance was already released.", undefined);
    }
    if (found.status !== "ready") throw new ApiError(409, `PASS_${found.status.toUpperCase()}`, "This claim pass cannot be released now.");
    let amount = found.amount;
    if (amount == null) {
      const typed = Number(input.amount);
      if (!Number.isFinite(typed) || typed <= 0 || typed > MAX_AMOUNT || Math.round(typed * 100) !== typed * 100) {
        throw invalid("amount", `Enter the amount released, up to ${peso(MAX_AMOUNT)}.`);
      }
      amount = typed;
    }
    const { pass, schedule } = found;
    const now = new Date();
    const reference = `GAI-${manilaDate(now).replaceAll("-", "")}-${String(schedule!.queueNumber).padStart(3, "0")}-${randomBytes(2).toString("hex").toUpperCase()}`;
    const result = await prisma.$transaction(async (tx) => {
      // Use the pass exactly once, even if two staff scan it at the same moment.
      const used = await tx.qrToken.updateMany({ where: { qrTokenId: pass.qrTokenId, qrStatus: "active" }, data: { qrStatus: "used" } });
      if (used.count !== 1) throw new ApiError(409, "ALREADY_RELEASED", "This claim pass was just used.");
      const existing = await tx.claim.findUnique({
        where: { beneficiaryId_distributionId: { beneficiaryId: pass.beneficiaryId, distributionId: pass.distributionId } },
      });
      if (existing?.claimStatus === "completed") throw new ApiError(409, "ALREADY_RELEASED", "This assistance was already released.");
      const claimData = {
        scheduleId: schedule!.scheduleId, claimStatus: "completed", verificationMethod: "qr", qrVerified: true,
        claimedAt: now, releasedByStaffId: staff.staffId,
      };
      const claim = existing
        ? await tx.claim.update({ where: { claimId: existing.claimId }, data: claimData })
        : await tx.claim.create({ data: { beneficiaryId: pass.beneficiaryId, distributionId: pass.distributionId, ...claimData } });
      await tx.schedule.update({ where: { scheduleId: schedule!.scheduleId }, data: { status: "claimed" } });
      const walletId = randomUUID();
      const wallet = await tx.walletAccount.upsert({
        where: { beneficiaryId: pass.beneficiaryId },
        update: { balance: { increment: amount! }, lastTransactionAt: now },
        create: { walletId, walletNumber: walletNumberFor(walletId), beneficiaryId: pass.beneficiaryId, balance: amount!, lastTransactionAt: now },
      });
      await tx.transaction.create({
        data: {
          claimId: claim.claimId, walletId: wallet.walletId, beneficiaryId: pass.beneficiaryId, amount: amount!,
          transactionType: "assistance_credit", referenceNo: reference, status: "posted",
          note: `Released by ${staff.displayName}`.slice(0, 160),
        },
      });
      const program = pass.distribution.program.programName;
      await tx.notification.create({
        data: {
          beneficiaryId: pass.beneficiaryId, scheduleId: schedule!.scheduleId, notificationType: "claim",
          title: "Assistance received", titleBs: "Nadawat ang ayuda",
          message: `${peso(amount!)} from ${program} was recorded in your wallet. Reference ${reference}.`,
          messageBs: `Ang ${peso(amount!)} gikan sa ${program} narekord sa imong wallet. Reference ${reference}.`,
        },
      });
      return { balance: Number(wallet.balance) };
    }, { isolationLevel: 'Serializable' });
    res.json({ data: { ...passView(await findPass(input.code)), walletBalance: result.balance } });
  });

  // Photo of the beneficiary's ID, so staff can compare it with the person and the card.
  app.get("/staff/api/beneficiaries/:beneficiaryId/id-photo", async (req, res, next) => {
    try {
      await requireStaff(req);
      const document = await prisma.beneficiaryDocument.findFirst({
        where: { beneficiaryId: uuid(req.params.beneficiaryId, "beneficiaryId"), docType: { in: ID_DOCUMENT_TYPES }, mimeType: { in: ["image/jpeg", "image/png"] } },
        orderBy: { createdAt: "desc" },
      });
      if (!document) throw new ApiError(404, "ID_PHOTO_NOT_FOUND", "No ID photo was uploaded.");
      res.set("Cache-Control", "private, no-store").type(document.mimeType)
        .sendFile(documentStoragePath(config.documentStorageDir, document.filePath), (error) => { if (error && !res.headersSent) next(error); });
    } catch (error) { next(error); }
  });

  // ── Programs chosen at sign-up ──
  app.get("/staff/api/enrollments", async (req, res) => {
    await requireStaff(req);
    const status = req.query.status === "approved" ? "approved" : "pending";
    const items = await prisma.enrollment.findMany({
      where: { status },
      include: { program: true, beneficiary: { include: { barangay: true } } },
      orderBy: { createdAt: "asc" }, take: 200,
    });
    res.json({ data: items.map((e) => ({
      id: e.enrollmentId, status: e.status, createdAt: e.createdAt.toISOString(), source: e.source,
      program: { id: e.programId, name: e.requestedProgramName ?? e.program.programName, code: e.program.programCode },
      memberReference: e.memberReference,
      beneficiary: {
        name: [e.beneficiary.firstName, e.beneficiary.middleName, e.beneficiary.lastName].filter(Boolean).join(" "),
        birthDate: dateOnly(e.beneficiary.birthDate), barangay: `${e.beneficiary.barangay.barangayName}, ${e.beneficiary.barangay.city}`,
        validIdType: e.beneficiary.validIdType,
      },
    })) });
  });

  app.post("/staff/api/enrollments/:enrollmentId/decision", async (req, res) => {
    const { staff } = await requireStaff(req);
    const enrollmentId = uuid(req.params.enrollmentId, "enrollmentId");
    const decision = body(req).decision;
    if (decision !== "approved" && decision !== "rejected") throw invalid("decision", "Choose approve or reject.");
    const enrollment = await prisma.enrollment.findUnique({ where: { enrollmentId }, include: { program: true } });
    if (!enrollment) throw new ApiError(404, "ENROLLMENT_NOT_FOUND", "Enrollment not found.");
    if (enrollment.status !== "pending") throw new ApiError(409, "ALREADY_DECIDED", "This request was already decided.");
    const name = enrollment.requestedProgramName ?? enrollment.program.programName;
    await prisma.$transaction([
      prisma.enrollment.update({ where: { enrollmentId }, data: { status: decision, reviewedAt: new Date(), reviewedByStaffId: staff.staffId } }),
      prisma.notification.create({
        data: decision === "approved" ? {
          beneficiaryId: enrollment.beneficiaryId, notificationType: "enrollment",
          title: "Program approved", titleBs: "Naaprobahan ang programa",
          message: `Your ${name} enrollment was approved. Your claiming schedule will appear on Home once it is published.`,
          messageBs: `Naaprobahan ang imong enrollment sa ${name}. Makita sa Home ang imong iskedyul kon ma-publish na.`,
        } : {
          beneficiaryId: enrollment.beneficiaryId, notificationType: "enrollment",
          title: "Program not approved", titleBs: "Wala maaprobahan ang programa",
          message: `Your ${name} request was not approved. Use Talk to staff in the app if you have questions.`,
          messageBs: `Wala maaprobahan ang imong hangyo sa ${name}. Gamita ang Pakigsulti sa staff sa app kon naa kay pangutana.`,
        },
      }),
    ]);
    res.json({ data: { id: enrollmentId, status: decision } });
  });

  // ── Distributions ──
  app.get("/staff/api/programs", async (req, res) => {
    await requireStaff(req);
    const programs = await prisma.program.findMany({ where: { isActive: true }, orderBy: { programName: "asc" } });
    const counts = await prisma.enrollment.groupBy({ by: ["programId"], where: { status: { in: ["approved", "active"] } }, _count: true });
    res.json({ data: programs.map((p) => ({
      id: p.programId, code: p.programCode, name: p.programName,
      grantAmount: p.grantAmount == null ? null : Number(p.grantAmount),
      approved: counts.find((c) => c.programId === p.programId)?._count ?? 0,
    })) });
  });

  app.get("/staff/api/distributions", async (req, res) => {
    await requireStaff(req);
    const since = new Date(`${manilaDate(new Date(Date.now() - 7 * 864e5))}T00:00:00Z`);
    const items = await prisma.distribution.findMany({
      where: { distributionDate: { gte: since } }, include: { program: true },
      orderBy: { distributionDate: "asc" }, take: 50,
    });
    const scheduled = await prisma.schedule.groupBy({ by: ["distributionId", "status"], where: { distributionId: { in: items.map((d) => d.distributionId) } }, _count: true });
    res.json({ data: items.map((d) => {
      const rows = scheduled.filter((s) => s.distributionId === d.distributionId);
      return {
        id: d.distributionId, title: d.title, date: dateOnly(d.distributionDate), location: d.location, status: d.status,
        program: d.program.programName, amount: d.amount == null ? (d.program.grantAmount == null ? null : Number(d.program.grantAmount)) : Number(d.amount),
        scheduled: rows.reduce((sum, r) => sum + r._count, 0),
        released: rows.filter((r) => r.status === "claimed").reduce((sum, r) => sum + r._count, 0),
      };
    }) });
  });

  // Creates a distribution day and gives every approved member of the program a queue number and time slot.
  app.post("/staff/api/distributions", async (req, res) => {
    const { staff } = await requireStaff(req);
    const input = body(req);
    const programId = uuid(input.programId, "programId");
    const title = typeof input.title === "string" ? input.title.trim() : "";
    const location = typeof input.location === "string" ? input.location.trim() : "";
    const date = typeof input.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : "";
    const start = typeof input.startTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(input.startTime) ? input.startTime : "";
    const slotMinutes = Number(input.slotMinutes ?? 30);
    const perSlot = Number(input.perSlot ?? 20);
    const amount = input.amount === undefined || input.amount === null || input.amount === "" ? null : Number(input.amount);
    if (title.length < 3 || title.length > 160) throw invalid("title", "Enter a title (3 to 160 characters).");
    if (location.length < 3 || location.length > 255) throw invalid("location", "Enter the venue.");
    if (!date || date < manilaDate(new Date())) throw invalid("date", "Choose today or a later date.");
    if (!start) throw invalid("startTime", "Enter the start time, for example 08:00.");
    if (!Number.isInteger(slotMinutes) || slotMinutes < 10 || slotMinutes > 180) throw invalid("slotMinutes", "Use 10 to 180 minutes per time slot.");
    if (!Number.isInteger(perSlot) || perSlot < 1 || perSlot > 200) throw invalid("perSlot", "Use 1 to 200 people per time slot.");
    if (amount !== null && (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT)) throw invalid("amount", `Use an amount up to ${peso(MAX_AMOUNT)}.`);
    const program = await prisma.program.findUnique({ where: { programId } });
    if (!program) throw invalid("programId", "Choose a program.");
    const members = await prisma.enrollment.findMany({
      where: { programId, status: { in: ["approved", "active"] }, beneficiary: { isVerified: true } },
      orderBy: { createdAt: "asc" }, select: { beneficiaryId: true },
    });
    if (!members.length) throw new ApiError(409, "NO_APPROVED_MEMBERS", "No approved members of this program yet. Approve enrollments first.");
    const [hours, minutes] = start.split(":").map(Number);
    const [y, m, d] = date.split("-").map(Number);
    const firstSlot = Date.UTC(y, m - 1, d, hours - 8, minutes); // Philippine time is UTC+8 all year.
    const distribution = await prisma.$transaction(async (tx) => {
      const created = await tx.distribution.create({
        data: { programId, title, location, distributionDate: new Date(`${date}T00:00:00Z`), amount, status: "scheduled" },
      });
      const schedules = members.map((member, index) => {
        const slotStart = new Date(firstSlot + Math.floor(index / perSlot) * slotMinutes * 60_000);
        return {
          scheduleId: randomUUID(), distributionId: created.distributionId, beneficiaryId: member.beneficiaryId,
          slotStart, slotEnd: new Date(slotStart.getTime() + slotMinutes * 60_000), queueNumber: index + 1, status: "scheduled",
        };
      });
      await tx.schedule.createMany({ data: schedules });
      const when = (at: Date) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(at);
      await tx.notification.createMany({ data: schedules.map((s) => ({
        beneficiaryId: s.beneficiaryId, scheduleId: s.scheduleId, notificationType: "schedule",
        title: "Claiming schedule published", titleBs: "Na-publish ang iskedyul sa claim",
        message: `${program.programName}: ${when(s.slotStart)} at ${location}. Your queue number is #${String(s.queueNumber).padStart(3, "0")}. Bring your QR claim pass.`,
        messageBs: `${program.programName}: ${when(s.slotStart)} sa ${location}. Ang imong numero sa pila kay #${String(s.queueNumber).padStart(3, "0")}. Dad-a ang imong QR claim pass.`,
      })) });
      return created;
    });
    console.info(`Distribution ${distribution.distributionId} created by staff ${staff.username} for ${members.length} beneficiaries.`);
    res.status(201).json({ data: { id: distribution.distributionId, scheduled: members.length } });
  });
}

