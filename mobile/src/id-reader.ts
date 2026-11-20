import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { parseIdText, type ScannedId } from './id-scan';

type RecognizedLine = { text: string; x: number; y: number; height: number };
type NativeReader = { recognizeText(uri: string): Promise<{ text: string; lines: RecognizedLine[] }> };

/** True when this app build includes the on-device ID reader (Android development or release builds). */
export function idReaderAvailable() {
  return Platform.OS === 'android' && !!requireOptionalNativeModule<NativeReader>('GarantiyAidFaceDetector')?.recognizeText;
}

/** Reads the ID photo on the phone with ML Kit. The photo is not sent anywhere for reading. */
export async function readIdPhoto(uri: string, idType: string): Promise<ScannedId> {
  const native = Platform.OS === 'android' ? requireOptionalNativeModule<NativeReader>('GarantiyAidFaceDetector') : null;
  if (!native?.recognizeText) throw new Error('ID_READER_BUILD_REQUIRED');
  const { lines } = await native.recognizeText(uri);
  // Group lines into rows (top to bottom), then read each row left to right.
  const rows: RecognizedLine[][] = [];
  for (const line of [...lines].sort((a, b) => a.y - b.y)) {
    const row = rows[rows.length - 1];
    if (row && line.y - row[0].y < Math.max(row[0].height, line.height) * 0.5) row.push(line);
    else rows.push([line]);
  }
  const ordered = rows.flatMap((row) => row.sort((a, b) => a.x - b.x));
  return parseIdText(ordered.map((line) => line.text), idType);
}
