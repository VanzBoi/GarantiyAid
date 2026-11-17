import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
type Voice = { speak(text: string): void; stopSpeaking(): void };
export function stopFaceVoice() {
  if (Platform.OS === 'web') globalThis.speechSynthesis?.cancel();
  else requireOptionalNativeModule<Voice>('GarantiyAidFaceDetector')?.stopSpeaking();
}
/** Optional English voice guidance. Device voice availability varies; text stays visible. */
export function speakFaceHint(text: string) {
  if (Platform.OS === 'web') {
    if (!globalThis.speechSynthesis) return;
    globalThis.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'en-US'; utterance.rate = .9;
    globalThis.speechSynthesis.speak(utterance);
  } else requireOptionalNativeModule<Voice>('GarantiyAidFaceDetector')?.speak(text);
}
