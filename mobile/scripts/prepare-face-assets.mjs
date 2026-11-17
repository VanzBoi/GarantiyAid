import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const target = resolve(root, 'public/face-model');
const model = resolve(target, 'face_landmarker.task');
const checksum = '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff';
const valid = bytes => createHash('sha256').update(bytes).digest('hex') === checksum;
await mkdir(target, { recursive: true });
let bytes;
try { bytes = await readFile(model); } catch {}
if (!bytes || !valid(bytes)) {
  const response = await fetch('https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error('Face model download failed. Run npm run face:assets when connected.');
  bytes = Buffer.from(await response.arrayBuffer());
  if (!valid(bytes)) throw new Error('Face model checksum mismatch.');
  await writeFile(model, bytes);
}
await cp(resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm'), resolve(target, 'wasm'), { recursive: true });
console.log('Pinned face model and runtime prepared. Camera frames are processed locally.');
