// Password sign-in, email verification, simulated wallet activity, simulated face capture,
// and saved assistant conversations. Simulated features never move real money and never
// compare faces; every response says so with `simulated: true`.
import type { Express, Request } from "express";
import { createHash, randomUUID } from "node:crypto";
import { config } from "./config.ts";
import { prisma } from "./db.ts";
import { ApiError } from "./errors.ts";
import { hashPassword, hashSecret, normalizePhilippinePhone, passwordMatches } from "./security.ts";
import { uuid } from "./validation.ts";
import { FaceChallenges, processRealFace, type FacePurpose } from './face-processor.ts';

type Beneficiary = Awaited<ReturnType<typeof prisma.beneficiary.findUniqueOrThrow>>;
type Helpers = {
  requireBeneficiary: (req: Request) => Promise<{ session: { sessionId: string }; beneficiary: Beneficiary }>;
  issueOtp: (beneficiaryId: string, purpose: "reset" | "email", binding?: string) => Promise<string | undefined>;
  consumeOtp: (beneficiaryId: string, purpose: "reset" | "email", code: string, binding?: string) => Promise<void>;
  createSession: (beneficiaryId: string) => Promise<{ accessToken: string; tokenType: string; expiresAt: string }>;
  publicBeneficiary: (beneficiary: Beneficiary) => Record<string, unknown>;
  walletNumberFor: (walletId: string) => string;
};

const invalid = (field: string, message: string) =>
  new ApiError(422, "VALIDATION_ERROR", "Please correct the highlighted fields.", { [field]: message });

function body(req: Request): Record<string, unknown> {
  const value = req.body;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "INVALID_BODY", "Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function phone(value: unknown) {
  const contactNumber = normalizePhilippinePhone(String(value ?? ""));
  if (!contactNumber) throw new ApiError(422, "INVALID_PHONE", "Enter a valid Philippine mobile number.");
  return contactNumber;
}

function otpCode(value: unknown) {
  if (typeof value !== "string" || !/^\d{6}$/.test(value)) {
    throw new ApiError(422, "INVALID_OTP", "Enter the six-digit verification code.");
  }
  return value;
}

export function parseNewPassword(value: unknown, field = "newPassword") {
  if (typeof value !== "string") throw invalid(field, "Enter a password.");
  if (value.length < 8 || value.length > 128) throw invalid(field, "Use 8 to 128 characters.");
  if (!/\p{L}/u.test(value) || !/\d/.test(value)) throw invalid(field, "Include at least one letter and one number.");
  return value;
}

export function parseEmail(value: unknown) {
  if (typeof value !== "string") throw invalid("email", "Enter an email address.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw invalid("email", "Enter a valid email address.");
  return email;
}

/** Pesos with at most two decimals, within the simulation limit. */
export function parseAmount(value: unknown, max: number) {
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(amount) || amount < 1 || amount > max || Math.round(amount * 100) !== amount * 100) {
    throw invalid("amount", `Enter an amount from ₱1 to ₱${max.toLocaleString("en-PH")}, with up to two decimals.`);
  }
  return amount;
}

export function parseWalletNumber(value: unknown) {
  const walletNumber = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^GA-[0-9A-F]{8}$/.test(walletNumber)) throw invalid("recipientWalletNumber", "Enter a wallet number like GA-1A2B3C4D.");
  return walletNumber;
}

const maskName = (first: string, last: string) => `${first.charAt(0)}${"*".repeat(3)} ${last.charAt(0)}.`;

// Small in-memory limiter for password guesses (per phone number and process).
const passwordFailures = new Map<string, { count: number; until: number }>();
function checkPasswordLimit(key: string) {
  const entry = passwordFailures.get(key);
  if (entry && entry.count >= 5 && entry.until > Date.now()) {
    throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Too many incorrect passwords. Wait 15 minutes or sign in with a code.");
  }
}
function recordPasswordFailure(key: string) {
  const entry = passwordFailures.get(key);
  const fresh = !entry || entry.until <= Date.now();
  passwordFailures.set(key, { count: fresh ? 1 : entry.count + 1, until: Date.now() + 15 * 60 * 1000 });
}

const CREDIT_LIMIT = 5000;
const TRANSFER_LIMIT = 5000;
const BALANCE_CAP = 50000;
const BIOMETRIC_POLICY_VERSION = "v1.0";
const FRAME_MIN_BYTES = 1024;
const FRAME_MAX_BYTES = 1.5 * 1024 * 1024;

/** Decodes camera frames, checks they are images, and returns their SHA-256 digests. Bytes are discarded. */
export function frameDigests(value: unknown, min: number, max: number) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw invalid("frames", `Capture ${min} to ${max} photos.`);
  }
  return value.map((frame, index) => {
    const data = typeof frame === "string" ? frame.replace(/^data:image\/(jpeg|png);base64,/, "") : "";
    const bytes = Buffer.from(data, "base64");
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png = bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    if (bytes.length < FRAME_MIN_BYTES || bytes.length > FRAME_MAX_BYTES || (!jpeg && !png)) {
      throw invalid("frames", `Photo ${index + 1} is not a usable camera image.`);
    }
    return createHash("sha256").update(bytes).digest("hex");
  });
}

/**
 * Simulated liveness: passes only when the guided prompts produced distinct photos.
 * It does not analyse faces or detect spoofing.
 */
export const simulatedLiveness = (digests: string[]) => new Set(digests).size === digests.length;

export function registerExtendedRoutes(app: Express, helpers: Helpers) {
  const { requireBeneficiary, issueOtp, consumeOtp, createSession, publicBeneficiary, walletNumberFor } = helpers;
  const faceChallenges = new FaceChallenges();

  // ───────────── Password sign-in, change, and reset ─────────────
  app.post("/auth/password/login", async (req, res) => {
    const input = body(req);
    const contactNumber = phone(input.contactNumber);
    const password = typeof input.password === "string" ? input.password : "";
    checkPasswordLimit(contactNumber);
    const beneficiary = await prisma.beneficiary.findUnique({ where: { contactNumber } });
    const matches = await passwordMatches(password, beneficiary?.passwordHash ?? null);
    if (!beneficiary || !matches) {
      recordPasswordFailure(contactNumber);
      throw new ApiError(401, "INVALID_CREDENTIALS", "The mobile number or password is incorrect.");
    }
    if (!beneficiary.isVerified) throw new ApiError(403, "ACCOUNT_NOT_VERIFIED", "Verify this account before signing in.");
    passwordFailures.delete(contactNumber);
    res.json({ data: { ...(await createSession(beneficiary.beneficiaryId)), beneficiary: publicBeneficiary(beneficiary) } });
  });

  app.put("/beneficiaries/me/password", async (req, res) => {
    const { session, beneficiary } = await requireBeneficiary(req);
    const input = body(req);
    const newPassword = parseNewPassword(input.newPassword);
    if (beneficiary.passwordHash) {
      const key = `change:${beneficiary.beneficiaryId}`;
      checkPasswordLimit(key);
      if (!(await passwordMatches(typeof input.currentPassword === "string" ? input.currentPassword : "", beneficiary.passwordHash))) {
        recordPasswordFailure(key);
        throw new ApiError(400, "CURRENT_PASSWORD_INCORRECT", "Your current password is incorrect.", {
          currentPassword: "Your current password is incorrect.",
        });
      }
      passwordFailures.delete(key);
    }
    const [updated] = await prisma.$transaction([
      prisma.beneficiary.update({
        where: { beneficiaryId: beneficiary.beneficiaryId },
        data: { passwordHash: await hashPassword(newPassword) },
      }),
      // Other devices must sign in again after a password change.
      prisma.authSession.updateMany({
        where: { beneficiaryId: beneficiary.beneficiaryId, revokedAt: null, sessionId: { not: session.sessionId } },
        data: { revokedAt: new Date() },
      }),
    ]);
    res.json({ data: publicBeneficiary(updated) });
  });

  app.post("/auth/password/reset/request", async (req, res) => {
    const contactNumber = phone(body(req).contactNumber);
    const beneficiary = await prisma.beneficiary.findUnique({ where: { contactNumber } });
    if (!beneficiary) throw new ApiError(404, "ACCOUNT_NOT_FOUND", "No account uses this mobile number.");
    if (!beneficiary.isVerified) throw new ApiError(403, "ACCOUNT_NOT_VERIFIED", "Verify this account before resetting a password.");
    const developmentOtp = await issueOtp(beneficiary.beneficiaryId, "reset");
    res.status(202).json({ data: { expiresInSeconds: 300, ...(developmentOtp ? { developmentOtp } : {}) } });
  });

  app.post("/auth/password/reset", async (req, res) => {
    const input = body(req);
    const contactNumber = phone(input.contactNumber);
    const code = otpCode(input.code);
    const newPassword = parseNewPassword(input.newPassword);
    const beneficiary = await prisma.beneficiary.findUnique({ where: { contactNumber } });
    if (!beneficiary) throw new ApiError(404, "ACCOUNT_NOT_FOUND", "No account uses this mobile number.");
    await consumeOtp(beneficiary.beneficiaryId, "reset", code);
    await prisma.$transaction([
      prisma.beneficiary.update({
        where: { beneficiaryId: beneficiary.beneficiaryId },
        data: { passwordHash: await hashPassword(newPassword) },
      }),
      prisma.authSession.updateMany({
        where: { beneficiaryId: beneficiary.beneficiaryId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    passwordFailures.delete(contactNumber);
    res.json({ data: { passwordReset: true } });
  });

  // ───────────── Email verification ─────────────
  app.post("/beneficiaries/me/email", async (req, res) => {
    const { beneficiary } = await requireBeneficiary(req);
    const email = parseEmail(body(req).email);
    const owner = await prisma.beneficiary.findUnique({ where: { email } });
    if (owner && owner.beneficiaryId !== beneficiary.beneficiaryId) {
      throw new ApiError(409, "EMAIL_IN_USE", "Another account uses this email address.", { email: "Another account uses this email address." });
    }
    const developmentOtp = await issueOtp(beneficiary.beneficiaryId, "email", email);
    res.status(202).json({ data: { email, expiresInSeconds: 300, ...(developmentOtp ? { developmentOtp } : {}) } });
  });

  app.post("/beneficiaries/me/email/verify", async (req, res) => {
    const { beneficiary } = await requireBeneficiary(req);
    const input = body(req);
    const email = parseEmail(input.email);
    await consumeOtp(beneficiary.beneficiaryId, "email", otpCode(input.code), email);
    const updated = await prisma.beneficiary.update({ where: { beneficiaryId: beneficiary.beneficiaryId }, data: { email } });
    res.json({ data: publicBeneficiary(updated) });
  });

  // ───────────── Simulated wallet ─────────────
  const walletSummary = (wallet: { walletId: string; walletNumber: string; balance: unknown; currency: string; accountStatus: string; lastTransactionAt: Date | null }) => ({
    id: wallet.walletId,
    walletNumber: wallet.walletNumber,
    simulated: true,
    balance: Number(wallet.balance),
    currency: wallet.currency,
    status: wallet.accountStatus,
    lastTransactionAt: wallet.lastTransactionAt?.toISOString() ?? null,
  });

  app.post("/beneficiaries/me/wallet", async (req, res) => {
    const { beneficiary } = await requireBeneficiary(req);
    if (!beneficiary.isVerified || beneficiary.status !== "active") {
      throw new ApiError(403, "ACCOUNT_NOT_VERIFIED", "Verify your account before creating a wallet.");
    }
    const existing = await prisma.walletAccount.findUnique({ where: { beneficiaryId: beneficiary.beneficiaryId } });
    if (existing) return res.json({ data: { wallet: walletSummary(existing), created: false } });
    const walletId = randomUUID();
    const wallet = await prisma.walletAccount.create({
      data: { walletId, walletNumber: walletNumberFor(walletId), beneficiaryId: beneficiary.beneficiaryId },
    });
    res.status(201).json({ data: { wallet: walletSummary(wallet), created: true } });
  });

  async function ownWallet(beneficiaryId: string) {
    const wallet = await prisma.walletAccount.findUnique({ where: { beneficiaryId } });
    if (!wallet) throw new ApiError(404, "WALLET_NOT_FOUND", "Create your wallet first.");
    if (wallet.accountStatus !== "active") throw new ApiError(403, "WALLET_INACTIVE", "This wallet is not active.");
    return wallet;
  }

  const entry = (transaction: { transactionId: string; amount: unknown; transactionType: string; referenceNo: string; status: string; createdAt: Date; note: string | null }, counterparty: string | null) => ({
    id: transaction.transactionId,
    claimId: null,
    amount: Number(transaction.amount),
    type: transaction.transactionType,
    reference: transaction.referenceNo,
    status: transaction.status,
    createdAt: transaction.createdAt.toISOString(),
    claimStatus: null,
    claimedAt: null,
    date: transaction.createdAt.toISOString().slice(0, 10),
    simulated: true,
    counterpartyWalletNumber: counterparty,
    note: transaction.note,
    program: null,
  });

  app.post("/beneficiaries/me/wallet/simulated-credits", async (req, res) => {
    const { beneficiary } = await requireBeneficiary(req);
    if (!beneficiary.isVerified) throw new ApiError(403, "ACCOUNT_NOT_VERIFIED", "Simulated credit is available after account verification.");
    const input = body(req);
    const amount = parseAmount(input.amount, CREDIT_LIMIT);
    const requestId = uuid(input.requestId, "requestId");
    const referenceNo = `SIM-CREDIT-${requestId}`;
    const wallet = await ownWallet(beneficiary.beneficiaryId);
    const previous = await prisma.transaction.findUnique({ where: { referenceNo } });
    if (previous) {
      if (previous.walletId !== wallet.walletId) throw new ApiError(409, "DUPLICATE_REQUEST", "This request was already used.");
      return res.json({ data: { transaction: entry(previous, null), wallet: walletSummary(await ownWallet(beneficiary.beneficiaryId)) } });
    }
    const result = await prisma.$transaction(async (tx) => {
      const credited = await tx.walletAccount.updateMany({
        where: { walletId: wallet.walletId, accountStatus: "active", balance: { lte: BALANCE_CAP - amount } },
        data: { balance: { increment: amount }, lastTransactionAt: new Date() },
      });
      if (!credited.count) throw new ApiError(422, "BALANCE_LIMIT", `Simulated wallets can hold up to ₱${BALANCE_CAP.toLocaleString("en-PH")}.`);
      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.walletId,
          beneficiaryId: beneficiary.beneficiaryId,
          amount,
          transactionType: "simulated_credit",
          referenceNo,
          status: "completed",
          note: "Simulated credit · no real funds",
        },
      });
      return { transaction, wallet: await tx.walletAccount.findUniqueOrThrow({ where: { walletId: wallet.walletId } }) };
    });
    res.status(201).json({ data: { transaction: entry(result.transaction, null), wallet: walletSummary(result.wallet) } });
  });

  app.get("/beneficiaries/me/wallet/recipients/:walletNumber", async (req, res) => {
    const { beneficiary } = await requireBeneficiary(req);
    const walletNumber = parseWalletNumber(req.params.walletNumber);
    const recipient = await prisma.walletAccount.findUnique({ where: { walletNumber }, include: { beneficiary: true } });
    if (!recipient || recipient.accountStatus !== "active") throw new ApiError(404, "RECIPIENT_NOT_FOUND", "No active wallet uses this number.");
    if (recipient.beneficiaryId === beneficiary.beneficiaryId) throw new ApiError(422, "SELF_TRANSFER", "Choose another person's wallet.");
    res.json({ data: { walletNumber, displayName: maskName(recipient.beneficiary.firstName, recipient.beneficiary.lastName) } });
  });

  app.post("/beneficiaries/me/wallet/simulated-transfers", async (req, res) => {
    const { beneficiary } = await requireBeneficiary(req);
    const input = body(req);
    const walletNumber = parseWalletNumber(input.recipientWalletNumber);
    const amount = parseAmount(input.amount, TRANSFER_LIMIT);
    const requestId = uuid(input.requestId, "requestId");
    const note = typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, 120) : null;
    const referenceNo = `SIM-TRANSFER-${requestId}`;
    const wallet = await ownWallet(beneficiary.beneficiaryId);
    const recipient = await prisma.walletAccount.findUnique({ where: { walletNumber } });
    if (!recipient || recipient.accountStatus !== "active") throw new ApiError(404, "RECIPIENT_NOT_FOUND", "No active wallet uses this number.");
    if (recipient.walletId === wallet.walletId) throw new ApiError(422, "SELF_TRANSFER", "Choose another person's wallet.");
    const previous = await prisma.transaction.findUnique({ where: { referenceNo } });
    if (previous) {
      if (previous.walletId !== wallet.walletId) throw new ApiError(409, "DUPLICATE_REQUEST", "This request was already used.");
      return res.json({ data: { transaction: entry(previous, walletNumber), wallet: walletSummary(await ownWallet(beneficiary.beneficiaryId)) } });
    }
    const result = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const debited = await tx.walletAccount.updateMany({
        where: { walletId: wallet.walletId, accountStatus: "active", balance: { gte: amount } },
        data: { balance: { decrement: amount }, lastTransactionAt: now },
      });
      if (!debited.count) throw new ApiError(422, "INSUFFICIENT_BALANCE", "Your simulated balance is not enough for this transfer.");
      const credited = await tx.walletAccount.updateMany({
        where: { walletId: recipient.walletId, accountStatus: "active", balance: { lte: BALANCE_CAP - amount } },
        data: { balance: { increment: amount }, lastTransactionAt: now },
      });
      if (!credited.count) throw new ApiError(422, "RECIPIENT_UNAVAILABLE", "The recipient wallet cannot receive this amount.");
      const sent = await tx.transaction.create({
        data: {
          walletId: wallet.walletId, beneficiaryId: beneficiary.beneficiaryId, amount: -amount,
          transactionType: "simulated_transfer_out", referenceNo, status: "completed",
          counterpartyWalletId: recipient.walletId, note,
        },
      });
      await tx.transaction.create({
        data: {
          walletId: recipient.walletId, beneficiaryId: recipient.beneficiaryId, amount,
          transactionType: "simulated_transfer_in", referenceNo: `${referenceNo}-IN`, status: "completed",
          counterpartyWalletId: wallet.walletId, note,
        },
      });
      return { sent, wallet: await tx.walletAccount.findUniqueOrThrow({ where: { walletId: wallet.walletId } }) };
    });
    res.status(201).json({ data: { transaction: entry(result.sent, walletNumber), wallet: walletSummary(result.wallet) } });
  });

  // ───────────── Simulated face capture and verification ─────────────
  const policyRetention = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  async function biometricOverview(beneficiaryId: string) {
    const [consent, profile] = await Promise.all([
      prisma.biometricConsent.findFirst({ where: { beneficiaryId }, orderBy: { consentedAt: "desc" } }),
      prisma.biometricProfile.findUnique({ where: { beneficiaryId } }),
    ]);
    const consentActive = consent?.status === "active" && consent.retentionUntil > new Date();
    return {
      enrollmentMethod: "self_capture" as const,
      processorMode: config.faceRemote ? 'remote' : 'simulated',
      selfCapture: true,
      policy: { version: BIOMETRIC_POLICY_VERSION, retentionUntil: policyRetention().toISOString() },
      consent: consent
        ? {
            id: consent.consentId,
            version: consent.version,
            status: consent.status === "active" && !consentActive ? "expired" : consent.status,
            consentedAt: consent.consentedAt.toISOString(),
            revokedAt: consent.revokedAt?.toISOString() ?? null,
            retentionUntil: consent.retentionUntil.toISOString(),
          }
        : null,
      profile: profile
        ? {
            id: profile.profileId,
            consentId: profile.consentId,
            status: (!consentActive || profile.consentId !== consent?.consentId) && profile.status === "enrolled" ? "consent_required" : profile.status,
            simulated: profile.simulated,
            processorCompatible: profile.simulated ? !config.faceRemote : !!config.faceRemote && profile.templateHash === faceSubject(beneficiaryId, profile.consentId),
            livenessPassed: !profile.simulated && profile.livenessPassed,
            enrolledAt: profile.enrolledAt.toISOString(),
            lastVerifiedAt: profile.lastVerifiedAt?.toISOString() ?? null,
          }
        : null,
    };
  }

  async function activeConsent(beneficiaryId: string) {
    const consent = await prisma.biometricConsent.findFirst({
      where: { beneficiaryId, status: "active", retentionUntil: { gt: new Date() } },
      orderBy: { consentedAt: "desc" },
    });
    if (!consent) throw new ApiError(403, "CONSENT_REQUIRED", "Give face verification consent first.");
    return consent;
  }

  function faceSubject(beneficiaryId: string, consentId: string) {
    // Opaque provider subject, not an image hash or a face embedding. Model changes require enrollment.
    return hashSecret(`${beneficiaryId}:${consentId}:${config.faceRemote?.url}:${config.faceRemote?.version}`, 'face', config.authPepper);
  }

  app.post('/beneficiaries/me/biometrics/challenge', async (req, res) => {
    const { beneficiary, session } = await requireBeneficiary(req);
    const consent = await activeConsent(beneficiary.beneficiaryId);
    const purpose = body(req).purpose;
    if (purpose !== 'enroll' && purpose !== 'verify') throw invalid('purpose', 'Choose enroll or verify.');
    res.set('Cache-Control', 'private, no-store').json({ data: faceChallenges.issue(session.sessionId, beneficiary.beneficiaryId, consent.consentId, purpose) });
  });

  app.get("/beneficiaries/me/biometrics", async (req, res) => {
    const { beneficiary } = await requireBeneficiary(req);
    res.json({ data: await biometricOverview(beneficiary.beneficiaryId) });
  });

  app.post("/beneficiaries/me/biometric-consents", async (req, res) => {
    const { beneficiary } = await requireBeneficiary(req);
    const input = body(req);
    if (input.consentVersion !== BIOMETRIC_POLICY_VERSION) {
      throw new ApiError(409, "CONSENT_VERSION_CHANGED", "The consent notice changed. Review it again.");
    }
    const expected = input.expectedConsentId === null || input.expectedConsentId === undefined ? null : uuid(input.expectedConsentId, "expectedConsentId");
    const current = await prisma.biometricConsent.findFirst({
      where: { beneficiaryId: beneficiary.beneficiaryId, status: "active" },
      orderBy: { consentedAt: "desc" },
    });
    if ((current?.consentId ?? null) !== expected) throw new ApiError(409, "CONSENT_CHANGED", "Consent changed. Refresh and review the notice again.");
    await prisma.$transaction([
      prisma.biometricConsent.updateMany({
        where: { beneficiaryId: beneficiary.beneficiaryId, status: "active" },
        data: { status: "revoked", revokedAt: new Date() },
      }),
      prisma.biometricConsent.create({
        data: { beneficiaryId: beneficiary.beneficiaryId, version: BIOMETRIC_POLICY_VERSION, retentionUntil: policyRetention() },
      }),
    ]);
    res.status(201).json({ data: await biometricOverview(beneficiary.beneficiaryId) });
  });

  app.post("/beneficiaries/me/biometric-consents/:consentId/revoke", async (req, res) => {
    const { beneficiary } = await requireBeneficiary(req);
    const consentId = uuid(req.params.consentId, "consentId");
    const revoked = await prisma.biometricConsent.updateMany({
      where: { consentId, beneficiaryId: beneficiary.beneficiaryId, status: "active" },
      data: { status: "revoked", revokedAt: new Date() },
    });
    if (!revoked.count) throw new ApiError(409, "CONSENT_CHANGED", "Consent changed. Refresh before trying again.");
    await prisma.biometricProfile.updateMany({ where: { beneficiaryId: beneficiary.beneficiaryId, consentId }, data: { status: "revoked" } });
    res.json({ data: await biometricOverview(beneficiary.beneficiaryId) });
  });

  async function captureFace(req: Request, purpose: FacePurpose) {
    const { beneficiary, session } = await requireBeneficiary(req);
    const consent = await activeConsent(beneficiary.beneficiaryId);
    const input = body(req);
    const digests = frameDigests(input.frames, purpose === 'enroll' ? 4 : 3, purpose === 'enroll' ? 4 : 3);
    const challenge = faceChallenges.consume(input.challengeId, session.sessionId, beneficiary.beneficiaryId, consent.consentId, purpose);
    const templateHash = faceSubject(beneficiary.beneficiaryId, consent.consentId);
    const profile = await prisma.biometricProfile.findUnique({ where: { beneficiaryId: beneficiary.beneficiaryId } });
    if (purpose === 'verify' && (!profile || profile.status !== 'enrolled' || profile.consentId !== consent.consentId || (config.faceRemote && (profile.simulated || profile.templateHash !== templateHash)))) {
      throw new ApiError(409, 'FACE_ENROLLMENT_REQUIRED', 'Register your face with the current processor and consent first.');
    }
    if (!simulatedLiveness(digests)) throw new ApiError(422, 'CAPTURE_REPEATED', 'The capture repeated a frame. Start again.');
    const real = config.faceRemote ? await processRealFace(config.faceRemote, templateHash, challenge, input.frames as string[]) : null;
    const matched = purpose === 'verify' && !!real?.matched;
    const checkedAt = new Date();
    await prisma.$transaction(async tx => {
      // Revalidate after processing: withdrawn consent or logout cannot produce a saved success.
      const current = await tx.biometricConsent.findUnique({ where: { consentId: consent.consentId } });
      const activeSession = await tx.authSession.findFirst({ where: { sessionId: session.sessionId, beneficiaryId: beneficiary.beneficiaryId, revokedAt: null, expiresAt: { gt: new Date() } } });
      if (!activeSession || !current || current.status !== 'active' || current.retentionUntil <= new Date() || Date.parse(challenge.expiresAt) <= Date.now()) throw new ApiError(409, 'FACE_CAPTURE_CHANGED', 'Consent, session or capture challenge changed. Start again.');
      if (purpose === 'enroll') {
        const data = { consentId: consent.consentId, status: 'enrolled', simulated: !real, processorCompatible: true,
          templateHash, livenessPassed: !!real, enrolledAt: checkedAt, lastVerifiedAt: null };
        await tx.biometricProfile.upsert({ where: { beneficiaryId: beneficiary.beneficiaryId }, update: data, create: { beneficiaryId: beneficiary.beneficiaryId, ...data } });
      } else if (matched) {
        const updated = await tx.biometricProfile.updateMany({ where: { profileId: profile!.profileId, consentId: consent.consentId, templateHash, status: 'enrolled', simulated: false }, data: { lastVerifiedAt: checkedAt } });
        if (updated.count !== 1) throw new ApiError(409, 'FACE_CAPTURE_CHANGED', 'Enrollment changed. Start again.');
      }
    }, { isolationLevel: 'Serializable' });
    return { result: real ? purpose === 'enroll' ? 'enrolled' : matched ? 'matched' : 'not_matched' : 'simulated_capture',
      simulated: !real, facesCompared: purpose === 'verify' && !!real, livenessPassed: !!real,
      verifiedAt: matched ? checkedAt.toISOString() : null,
      overview: await biometricOverview(beneficiary.beneficiaryId),
      liveness: { passed: !!real, simulated: !real, method: real ? 'remote_processor' : 'not_performed' } };
  }
  app.post('/beneficiaries/me/biometrics/enrollment', async (req, res) => {
    res.set('Cache-Control', 'private, no-store').status(201).json({ data: await captureFace(req, 'enroll') });
  });
  app.post('/beneficiaries/me/biometrics/verification', async (req, res) => {
    res.set('Cache-Control', 'private, no-store').json({ data: await captureFace(req, 'verify') });
  });

  // ───────────── Assistant conversation history ─────────────
  app.get("/beneficiaries/me/assistant/messages", async (req, res) => {
    const { beneficiary } = await requireBeneficiary(req);
    const messages = await prisma.assistantMessage.findMany({
      where: { beneficiaryId: beneficiary.beneficiaryId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({
      data: messages.reverse().map((message) => ({
        id: message.messageId, role: message.role, text: message.text, createdAt: message.createdAt.toISOString(),
      })),
    });
  });

  app.post("/beneficiaries/me/assistant/messages", async (req, res) => {
    const { beneficiary } = await requireBeneficiary(req);
    const messages = body(req).messages;
    if (!Array.isArray(messages) || messages.length < 1 || messages.length > 4) throw invalid("messages", "Send one to four messages.");
    const base = Date.now();
    const rows = messages.map((message, index) => {
      const role = message?.role;
      const text = typeof message?.text === "string" ? message.text.trim() : "";
      if ((role !== "user" && role !== "assistant") || !text || text.length > 2000) throw invalid("messages", "Each message needs a role and text up to 2000 characters.");
      return { beneficiaryId: beneficiary.beneficiaryId, role, text, createdAt: new Date(base + index) };
    });
    await prisma.assistantMessage.createMany({ data: rows });
    res.status(201).json({ data: { saved: rows.length } });
  });

  app.delete("/beneficiaries/me/assistant/messages", async (req, res) => {
    const { beneficiary } = await requireBeneficiary(req);
    await prisma.assistantMessage.deleteMany({ where: { beneficiaryId: beneficiary.beneficiaryId } });
    res.sendStatus(204);
  });
}
