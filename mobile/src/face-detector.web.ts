import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { FaceObservation } from './face-guidance';

// Pinned model/runtime. Frames stay in this browser; only the selected capture is submitted.
export async function createFaceDetector() {
  const vision = await FilesetResolver.forVisionTasks('/face-model/wasm');
  const detector = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: '/face-model/face_landmarker.task' },
    runningMode: 'IMAGE', numFaces: 2, outputFaceBlendshapes: true,
  });
  let closed = false;
  return {
    async analyze(uri: string): Promise<FaceObservation> {
      if (closed) throw new Error('DETECTOR_CLOSED');
      const img = new Image(); img.src = uri; await img.decode();
      const result = detector.detect(img);
      const points = result.faceLandmarks[0];
      const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 120;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('CANVAS_UNAVAILABLE');
      ctx.drawImage(img, 0, 0, 160, 120);
      const pixels = ctx.getImageData(0, 0, 160, 120).data;
      let light = 0, differences = 0;
      for (let y = 1; y < 119; y++) for (let x = 1; x < 159; x++) {
        const i = (y * 160 + x) * 4;
        const luma = (j: number) => pixels[j] * .299 + pixels[j + 1] * .587 + pixels[j + 2] * .114;
        const v = luma(i); light += v;
        differences += Math.abs(4 * v - luma(i - 4) - luma(i + 4) - luma(i - 640) - luma(i + 640));
      }
      const total = 118 * 158;
      const base = { count: result.faceLandmarks.length, brightness: light / total, sharpness: differences / total };
      if (!points) return { ...base, x: 0, y: 0, width: 0, height: 0, yaw: 0, roll: 0, leftEye: -1, rightEye: -1 };
      const xs = points.map(p => p.x), ys = points.map(p => p.y);
      const eye1 = points[33], eye2 = points[263], nose = points[1];
      const center = (eye1.x + eye2.x) / 2;
      const half = Math.max(.01, Math.abs(eye2.x - eye1.x) / 2);
      const scores = result.faceBlendshapes[0]?.categories ?? [];
      const score = (name: string) => scores.find(s => s.categoryName === name)?.score;
      return { ...base, x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys),
        yaw: Math.max(-60, Math.min(60, (nose.x - center) / half * 45)),
        roll: Math.atan2(eye2.y - eye1.y, eye2.x - eye1.x) * 180 / Math.PI,
        leftEye: score('eyeBlinkLeft') === undefined ? -1 : 1 - score('eyeBlinkLeft')!,
        rightEye: score('eyeBlinkRight') === undefined ? -1 : 1 - score('eyeBlinkRight')!,
      };
    },
    close() { if (!closed) { closed = true; detector.close(); } },
  };
}
