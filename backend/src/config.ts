import "dotenv/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required. Copy .env.example to .env and set it.`);
  return value;
}

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const authPepper = required("AUTH_PEPPER");
if (authPepper.length < 32) throw new Error("AUTH_PEPPER must contain at least 32 characters.");

const faceMode = process.env.FACE_PROCESSOR_MODE ?? 'SIMULATED';
if (!['SIMULATED', 'REMOTE'].includes(faceMode)) throw new Error('Invalid FACE_PROCESSOR_MODE.');
const faceRemote = faceMode === 'REMOTE' ? {
  url: required('FACE_PROCESSOR_URL'), secret: required('FACE_PROCESSOR_SECRET'), version: required('FACE_PROCESSOR_VERSION'),
} : null;
if (faceRemote) {
  const url = new URL(faceRemote.url);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('FACE_PROCESSOR_URL must use HTTPS, or HTTP on loopback.');
  }
}

export const config = {
  faceMode,
  faceRemote,
  nodeEnv: process.env.NODE_ENV ?? "development",
  port,
  databaseUrl: required("DATABASE_URL"),
  authPepper,
  documentStorageDir: resolve(fileURLToPath(new URL("../", import.meta.url)), process.env.DOCUMENT_STORAGE_DIR?.trim() || "storage/documents"),
  corsOrigins: new Set(
    (process.env.CORS_ORIGINS ?? "http://localhost:8765,http://127.0.0.1:8765")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  ),
};
