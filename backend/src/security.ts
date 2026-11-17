import { createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_COST = 16384;
const SCRYPT_KEY_LENGTH = 64;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolvePromise, reject) => {
    scrypt(password.normalize("NFKC"), salt, SCRYPT_KEY_LENGTH, { N: SCRYPT_COST, r: 8, p: 1 }, (error, key) =>
      error ? reject(error) : resolvePromise(key),
    );
  });
}

/** Stored as `scrypt$<cost>$<salt>$<hash>` in the existing password_hash column. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return `scrypt$${SCRYPT_COST}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function passwordMatches(password: string, stored: string | null): Promise<boolean> {
  const parts = stored?.split("$");
  if (!parts || parts.length !== 4 || parts[0] !== "scrypt" || Number(parts[1]) !== SCRYPT_COST) {
    // Spend comparable time so a missing password is not distinguishable by timing.
    await scryptAsync(password, randomBytes(16));
    return false;
  }
  const expected = Buffer.from(parts[3], "base64url");
  const actual = await scryptAsync(password, Buffer.from(parts[2], "base64url"));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Wallet numbers are derived from the wallet UUID, matching the migration backfill. */
export function walletNumberFor(walletId: string): string {
  return `GA-${walletId.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

export function normalizePhilippinePhone(input: string): string | null {
  const digits = input.replace(/[^0-9+]/g, "");
  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `+63${digits}`;
  if (/^\+639\d{9}$/.test(digits)) return digits;
  if (/^639\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}

export function createOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function createQrToken(): string {
  return `GAI1.${randomBytes(32).toString("base64url")}`;
}

type SecretPurpose = "otp" | "session" | "qr" | "face";

export function hashSecret(value: string, purpose: SecretPurpose, pepper: string): string {
  return createHmac("sha256", pepper).update(`${purpose}:${value}`).digest("hex");
}

export function secretMatches(
  value: string,
  expectedHash: string,
  purpose: SecretPurpose,
  pepper: string,
): boolean {
  const actual = Buffer.from(hashSecret(value, purpose, pepper), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
