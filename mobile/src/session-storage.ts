import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'garantiy-aid.session-token';
let pendingWrite: Promise<void> = Promise.resolve();

export async function getStoredToken(): Promise<string | null> {
  await pendingWrite;
  if (Platform.OS === 'web') {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(SESSION_KEY);
  }
  return SecureStore.getItemAsync(SESSION_KEY);
}

function writeToken(token: string | null): Promise<void> {
  // Preserve login/logout order even when native storage writes are delayed.
  const nextWrite = pendingWrite.then(async () => {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') {
        if (token === null) return;
        throw new Error('Browser storage is unavailable.');
      }
      if (token === null) localStorage.removeItem(SESSION_KEY);
      else localStorage.setItem(SESSION_KEY, token);
    } else if (token === null) {
      await SecureStore.deleteItemAsync(SESSION_KEY);
    } else {
      await SecureStore.setItemAsync(SESSION_KEY, token);
    }
  });
  pendingWrite = nextWrite.catch(() => {});
  return nextWrite;
}

export function storeToken(token: string): Promise<void> {
  return writeToken(token);
}

export function clearStoredToken(): Promise<void> {
  return writeToken(null);
}

// Face login key for this phone. It stays after logout (like a banking app) so the person can log in
// with their face next time. Only a phone that turned face login on has it; a password reset revokes it.
const FACE_LOGIN_KEY = 'garantiy-aid.face-login';
export type FaceLoginDevice = { deviceId: string; deviceSecret: string; beneficiaryId: string; firstName: string };

export async function getFaceLoginDevice(): Promise<FaceLoginDevice | null> {
  if (Platform.OS === 'web') return null;
  try {
    const raw = await SecureStore.getItemAsync(FACE_LOGIN_KEY);
    const value = raw ? JSON.parse(raw) as Partial<FaceLoginDevice> : null;
    return value?.deviceId && value.deviceSecret && value.beneficiaryId ? { firstName: '', ...value } as FaceLoginDevice : null;
  } catch {
    return null;
  }
}

export async function storeFaceLoginDevice(device: FaceLoginDevice) {
  if (Platform.OS === 'web') throw new Error('FACE_LOGIN_UNAVAILABLE');
  await SecureStore.setItemAsync(FACE_LOGIN_KEY, JSON.stringify(device));
}

export async function clearFaceLoginDevice() {
  if (Platform.OS === 'web') return;
  try { await SecureStore.deleteItemAsync(FACE_LOGIN_KEY); } catch { /* Nothing saved. */ }
}
