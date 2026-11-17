import { randomBytes, randomUUID } from 'node:crypto';
import { ApiError } from './errors.ts';

export type FacePurpose = 'enroll' | 'verify';
export type FaceChallenge = { id: string; nonce: string; purpose: FacePurpose; poses: ('center' | 'blink' | 'left' | 'right')[]; expiresAt: string };
type Saved = FaceChallenge & { sessionId: string; beneficiaryId: string; consentId: string };
/** Per-process, short-lived, single-use challenges. A restart invalidates unfinished captures. */
export class FaceChallenges {
  private entries = new Map<string, Saved>();
  issue(sessionId: string, beneficiaryId: string, consentId: string, purpose: FacePurpose, now = Date.now()) {
    for (const [id, item] of this.entries) if (Date.parse(item.expiresAt) <= now || item.sessionId === sessionId) this.entries.delete(id);
    if (this.entries.size >= 2000) throw new ApiError(429, 'FACE_BUSY', 'Try face capture again shortly.');
    const item: Saved = { id: randomUUID(), nonce: randomBytes(24).toString('base64url'), sessionId, beneficiaryId, consentId, purpose,
      poses: purpose === 'enroll' ? ['center', 'blink', randomBytes(1)[0] % 2 ? 'left' : 'right'] : ['center', 'blink'],
      expiresAt: new Date(now + 90_000).toISOString() };
    this.entries.set(item.id, item);
    const { sessionId: _s, beneficiaryId: _b, consentId: _c, ...publicChallenge } = item;
    return publicChallenge;
  }
  consume(id: unknown, sessionId: string, beneficiaryId: string, consentId: string, purpose: FacePurpose, now = Date.now()) {
    const saved = typeof id === 'string' ? this.entries.get(id) : undefined;
    if (!saved || saved.sessionId !== sessionId || saved.beneficiaryId !== beneficiaryId || saved.consentId !== consentId || saved.purpose !== purpose) {
      throw new ApiError(409, 'FACE_CHALLENGE_INVALID', 'Start a new face capture.');
    }
    this.entries.delete(saved.id); // Consume synchronously before awaiting image processing.
    if (Date.parse(saved.expiresAt) <= now) throw new ApiError(409, 'FACE_CHALLENGE_EXPIRED', 'Face capture expired. Please start again.');
    return saved;
  }
}

type ProcessorConfig = { url: string; secret: string; version: string };
/** Contract for an independently validated matcher + presentation-attack detection service. */
export async function processRealFace(config: ProcessorConfig, subject: string, challenge: FaceChallenge, frames: string[], send: typeof fetch = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await send(`${config.url.replace(/\/$/, '')}/v1/${challenge.purpose}`, {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { Authorization: `Bearer ${config.secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, challenge, frames, processorVersion: config.version }),
    });
    if (!response.ok) throw new Error('PROCESSOR_UNAVAILABLE');
    const data = await response.json() as Record<string, unknown>;
    if (data.subject !== subject || data.challengeId !== challenge.id || data.processorVersion !== config.version || data.simulated !== false) throw new Error('INVALID_PROCESSOR_RESPONSE');
    if (data.livenessPassed !== true) throw new ApiError(422, 'FACE_LIVENESS_REJECTED', 'Presence could not be verified. Start again in good lighting.');
    if (challenge.purpose === 'verify' && data.facesCompared !== true) throw new Error('INVALID_PROCESSOR_RESPONSE');
    if (challenge.purpose === 'enroll' && data.enrolled !== true) throw new ApiError(422, 'FACE_ENROLLMENT_REJECTED', 'Face enrollment could not be completed.');
    return { matched: data.matched === true, livenessPassed: true as const, processorVersion: config.version };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // Never echo provider output, credentials, captures or face scores.
    throw new ApiError(503, 'FACE_PROCESSOR_UNAVAILABLE', 'Face verification is unavailable. Try again later.');
  } finally { clearTimeout(timer); }
}
