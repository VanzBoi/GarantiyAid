import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { FaceObservation } from './face-guidance';

type NativeDetector = { analyze(uri: string): Promise<FaceObservation> };
export async function createFaceDetector() {
  const native = Platform.OS === 'android' ? requireOptionalNativeModule<NativeDetector>('GarantiyAidFaceDetector') : null;
  if (!native) throw new Error('FACE_DETECTOR_BUILD_REQUIRED');
  return { analyze: (uri: string) => native.analyze(uri), close() {} };
}
