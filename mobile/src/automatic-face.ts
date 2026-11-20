import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { CameraView } from 'expo-camera';
import { File } from 'expo-file-system';
import { createFaceDetector } from './face-detector';
import { emptyGuide, guideFace, type Guidance } from './face-guidance';
import { enrollFace, faceLogin, getFaceChallenge, getFaceLoginChallenge, verifyFace, type FaceChallenge, type FaceEnrollmentResult, type FaceLoginCredential, type FaceLoginResult, type FaceVerificationResult } from './api';

export const faceHints: Record<Guidance, [string, string]> = {
  searching: ['Position your face inside the oval', 'Ibutang ang nawong sulod sa oval'],
  multiple: ['Only one person in the camera, please', 'Usa ra ka tawo sa camera, palihog'],
  closer: ['Move a little closer', 'Duol gamay sa camera'], farther: ['Move a little farther away', 'Palayo gamay sa camera'],
  center: ['Center your face in the oval', 'I-center ang nawong sa oval'], light: ['Find even lighting for your face', 'Pangita og patas nga kahayag sa nawong'],
  blur: ['Hold your phone steady', 'Pabiling steady ang cellphone'], straight: ['Look straight at the camera', 'Tan-aw diretso sa camera'],
  hold: ['Hold still — capturing automatically', 'Pabilin lang — automatic ang pagkuha'],
  close: ['Close your eyes briefly', 'Piyonga kadiyot ang mga mata'], open: ['Now open your eyes', 'Ablihi na ang mga mata'],
  left: ['Turn your face slightly to your left', 'Lingi gamay sa imong wala'], right: ['Turn your face slightly to your right', 'Lingi gamay sa imong tuo'], captured: ['Captured', 'Nakuha na'],
};
type Options = {
  camera: RefObject<CameraView | null>; active: boolean; ready: boolean; accessToken: string; consentId?: string; verify: boolean;
  /** Face login on a phone where it was turned on: no session yet, the phone's key identifies the account. */
  login?: FaceLoginCredential;
  onSending(): void; onResult(result: FaceEnrollmentResult | FaceVerificationResult): void; onError(error: unknown): void; onPause(): void;
  onLogin?(session: FaceLoginResult): void;
};
export function useAutomaticFace(options: Options) {
  const callbacks = useRef(options); callbacks.current = options;
  const [focused, setFocused] = useState(true);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [guidance, setGuidance] = useState<Guidance>('searching');
  const [progress, setProgress] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(options.verify ? 2 : 3);
  const [initializing, setInitializing] = useState(true);
  useFocusEffect(useCallback(() => { setFocused(true); return () => { setFocused(false); }; }, []));
  useEffect(() => { const sub = AppState.addEventListener('change', value => setForeground(value === 'active')); return () => sub.remove(); }, []);
  useEffect(() => { if (!focused || !foreground) callbacks.current.onPause(); }, [focused, foreground]);
  useEffect(() => {
    if (!options.active || !options.ready || !focused || !foreground) return;
    let disposed = false;
    const { accessToken, consentId, verify, login } = options;
    const current = () => !disposed && callbacks.current.active && callbacks.current.accessToken === accessToken && callbacks.current.consentId === consentId
      && callbacks.current.verify === verify && callbacks.current.login?.deviceId === login?.deviceId;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let initializationTimer: ReturnType<typeof setTimeout> | undefined;
    let detector: Awaited<ReturnType<typeof createFaceDetector>> | undefined;
    let challenge: FaceChallenge;
    let guide = emptyGuide();
    let index = 0;
    let frames: string[] = [];
    const error = (cause: unknown) => { if (current()) callbacks.current.onError(cause); };
    async function submit() {
      callbacks.current.onSending();
      try {
        if (login) {
          const session = await faceLogin(login, frames, challenge.id);
          frames = [];
          if (current()) callbacks.current.onLogin?.(session);
          return;
        }
        const result = verify ? await verifyFace(accessToken, frames, challenge.id) : await enrollFace(accessToken, frames, challenge.id);
        frames = [];
        if (current()) callbacks.current.onResult(result);
      } catch (cause) { error(cause); }
    }
    async function tick() {
      if (!current()) return;
      if (Date.parse(challenge.expiresAt) <= Date.now()) { error(new Error('FACE_TIMEOUT')); return; }
      let uri = '';
      try {
        const picture = await options.camera.current?.takePictureAsync({ quality: .55, base64: true, exif: false, shutterSound: false });
        if (!picture) throw new Error('CAMERA_EMPTY');
        uri = picture.uri;
        if (!current()) return;
        const observation = await detector!.analyze(uri);
        if (!current()) return;
        const next = guideFace(observation, challenge.poses[index], guide, Date.now());
        guide = next.state; setGuidance(next.guidance); setProgress(next.progress);
        const data = picture.base64 || (uri.startsWith('data:') ? uri.slice(uri.indexOf(',') + 1) : '');
        if ((next.capture || next.evidence) && (!data || data.length > 2 * 1024 * 1024)) throw new Error('CAPTURE_TOO_LARGE');
        // The blink contributes a closed-eye frame and a reopened-eye frame for server analysis.
        if (next.evidence) { frames = frames.slice(0, index); frames.push(data); }
        if (next.capture) {
          frames.push(data); index++; guide = emptyGuide(); setCompleted(index); setProgress(0);
          if (index === challenge.poses.length) { await submit(); return; }
        }
      } catch (cause) { error(cause); return; }
      finally {
        if (Platform.OS !== 'web' && uri.startsWith('file:')) { try { const file = new File(uri); if (file.exists) file.delete(); } catch {} }
      }
      if (current()) timer = setTimeout(() => void tick(), 140);
    }
    setInitializing(true); setCompleted(0); setProgress(0); setGuidance('searching');
    initializationTimer = setTimeout(() => error(new Error('FACE_DETECTOR_LOAD_TIMEOUT')), 30_000);
    void (async () => {
      try {
        detector = await createFaceDetector();
        if (!current()) { detector.close(); return; }
        challenge = login ? await getFaceLoginChallenge(login) : await getFaceChallenge(accessToken, verify ? 'verify' : 'enroll');
        if (!current()) return;
        clearTimeout(initializationTimer);
        setTotal(challenge.poses.length); setInitializing(false); void tick();
      } catch (cause) { clearTimeout(initializationTimer); error(cause); }
    })();
    return () => { disposed = true; if (timer) clearTimeout(timer); clearTimeout(initializationTimer); frames = []; detector?.close(); };
  }, [options.active, options.ready, options.accessToken, options.consentId, options.verify, options.login?.deviceId, focused, foreground]);
  return { guidance, progress, completed, total, initializing, visible: focused && foreground };
}
