# Automatic face capture

The beneficiary saves consent and taps **Start automatic scan** once. After camera permission, the app detects one face, checks position/size, approximate brightness/sharpness, and stability. It automatically records a centered frame, a closed-eye frame, a reopened-eye frame, and (for enrollment) a server-selected head turn. There is no shutter button. Lost faces, extra faces and poor quality reset the relevant guidance. Holding a static image does not complete the eye prompt, but these guidance checks are **not presentation-attack detection**.

Camera analysis and temporary snapshots remain on the device. Only the selected frames are submitted. Native temporary files are deleted after analysis; frames in memory are dropped after submission/cancellation. Blurring the screen or backgrounding the app cancels analysis and unmounts the camera. Permission and consent remain explicit.

## Browser

Run `npm ci`, then `npm run face:assets` (included before web start/export). The script copies the pinned MediaPipe 0.10.32 WASM runtime and downloads version 1 of Google's face-landmarker model, checking SHA-256 `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`. Generated public assets are ignored and must be prepared before deployment. The browser then loads them from the same origin; captures are never sent to Google. Camera access needs localhost or HTTPS. A model load failure stops capture instead of fabricating detection.

## Android

`modules/face-detector` is a local Expo module using bundled ML Kit face detection 16.1.7. It analyzes app-cache snapshots from the existing Expo camera. This throttled snapshot implementation favors compatibility; device measurements are needed for speed, heat, blink sampling and battery usage. The eye prompt asks users to hold eyes closed briefly, then reopen them.

A **new Android development/release build is required**. Expo Go and old APKs do not contain the native module and show an upgrade message. Build with `npm run build:android:local` after installing/configuring the Android SDK, or the existing EAS development profile. SDK 57/new architecture is retained. iOS automatic detection is not implemented; it reports unavailable rather than accepting unchecked captures.

## Backend

The standalone API issues a 90-second challenge bound to the signed-in session, beneficiary, current consent and enroll/verify purpose. A new attempt replaces that session's previous challenge. Submission consumes it before processor I/O. Missing, expired, wrong-purpose and replayed challenges are rejected. Active session/consent and enrollment are checked again before saving a result.

The default `FACE_PROCESSOR_MODE=SIMULATED` records **demo capture only**, with `simulated: true`, `facesCompared: false`, `livenessPassed: false`, and `verifiedAt: null`. It never creates a real verification timestamp. Existing demo profiles stay simulated. Client measurements never authorize claims or wallet credits.

See [the processor contract](../../backend/docs/automatic-face.md) to connect a real backend service. The remote adapter is implemented, but a validated matcher/PAD service, real-device acceptance tests and spoof/accuracy testing are still required before real verification is available.

The challenge store is per API process. Use one process or sticky routing for this prototype; a multi-instance deployment needs an atomic shared challenge store. Shared staff backends must implement the same challenge/capture contract before exposing selfCapture.

## Acceptance checks

- No face, two faces, dim/backlit/blurred image, off-center/too close/too far, and moving camera must not auto-complete.
- Eyes remaining open or closed cannot complete the eye prompt; the close/open sequence must be observed.
- Test denied permission, model load failure, camera failure, network timeout, expiry, retries, background/resume, cancellation and account changes during analysis/submission.
- Real processing requires known match/mismatch, print/screen/video replay, consent renewal/revocation, changed model, failed PAD, duplicate submission, and physical Android testing across supported devices. Neither a test fixture nor a mocked remote response proves real face recognition.

Sources: [Expo camera](https://docs.expo.dev/versions/v57.0.0/sdk/camera/), [ML Kit](https://developers.google.com/ml-kit/vision/face-detection/android), [MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker).
