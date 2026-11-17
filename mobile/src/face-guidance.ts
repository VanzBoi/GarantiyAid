/** Capture assistance only. These client measurements never authorize identity or a claim. */
export type FaceObservation = {
  count: number;
  x: number; y: number; width: number; height: number;
  yaw: number; roll: number;
  leftEye: number; rightEye: number;
  brightness: number; sharpness: number;
};
export type FacePose = 'center' | 'blink' | 'left' | 'right';
export type Guidance = 'searching' | 'multiple' | 'closer' | 'farther' | 'center' | 'light' | 'blur' | 'straight' | 'hold' | 'close' | 'open' | 'left' | 'right' | 'captured';
export type GuideState = { since: number | null; previous: FaceObservation | null; closed: boolean; closedAt: number | null };
export const emptyGuide = (): GuideState => ({ since: null, previous: null, closed: false, closedAt: null });

export function guideFace(face: FaceObservation, pose: FacePose, state: GuideState, now: number) {
  const fail = (guidance: Guidance) => ({ guidance, capture: false, evidence: false, progress: 0, state: emptyGuide() });
  if (face.count === 0) return fail('searching');
  if (face.count !== 1) return fail('multiple');
  if (Object.values(face).some(value => !Number.isFinite(value))) return fail('searching');
  if (face.brightness < 50 || face.brightness > 235) return fail('light');
  if (face.width < 0.28 || face.height < 0.32) return fail('closer');
  if (face.width > 0.82 || face.height > 0.9) return fail('farther');
  if (Math.abs(face.x + face.width / 2 - 0.5) > 0.14 || Math.abs(face.y + face.height / 2 - 0.48) > 0.17) return fail('center');
  if (Math.abs(face.roll) > 15) return fail('straight');
  if (face.sharpness < 12) return fail('blur');
  const previous = state.previous;
  if (previous && (Math.abs(previous.x - face.x) > 0.05 || Math.abs(previous.y - face.y) > 0.05)) return fail('hold');
  const next = { ...state, previous: face };
  if (pose === 'blink') {
    if (!state.closed) {
      if (face.leftEye >= 0 && face.rightEye >= 0 && face.leftEye < 0.28 && face.rightEye < 0.28) {
        return { guidance: 'open' as Guidance, capture: false, evidence: true, progress: 0.5, state: { ...next, closed: true, closedAt: now } };
      }
      return { guidance: 'close' as Guidance, capture: false, evidence: false, progress: 0, state: next };
    }
    if (now - (state.closedAt ?? now) > 7000) return fail('close');
    const opened = face.leftEye > 0.7 && face.rightEye > 0.7;
    return { guidance: (opened ? 'captured' : 'open') as Guidance, capture: opened, evidence: false, progress: opened ? 1 : 0.5, state: next };
  }
  const aligned = pose === 'left' ? face.yaw < -18 : pose === 'right' ? face.yaw > 18 : Math.abs(face.yaw) < 12 && face.leftEye > 0.6 && face.rightEye > 0.6;
  if (!aligned) return { ...fail(pose === 'center' ? 'straight' : pose), state: { ...next, since: null } };
  const since = state.since ?? now;
  const progress = Math.min(1, (now - since) / 900);
  return { guidance: (progress === 1 ? 'captured' : 'hold') as Guidance, capture: progress === 1, evidence: false, progress, state: { ...next, since } };
}
