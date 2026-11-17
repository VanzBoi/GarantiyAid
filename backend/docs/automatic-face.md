# Face processor contract

The automatic capture client is implemented. Real identity verification additionally requires an independently validated face matcher and presentation-attack detection (PAD) service. The application does not supply or activate that service. Do not enable REMOTE merely to return positive responses.

Server-only configuration:

```
FACE_PROCESSOR_MODE=REMOTE
FACE_PROCESSOR_URL=https://your-private-processor
FACE_PROCESSOR_SECRET=server-to-server-credential
FACE_PROCESSOR_VERSION=your-validated-model-version
```

The URL must use HTTPS except for loopback development. Redirects are rejected and requests time out after 25 seconds. Credentials and captures are not logged. Do not put these variables in Expo public configuration.

The API sends `POST /v1/enroll` or `/v1/verify` with bearer authentication:

```json
{
  "subject": "opaque-64-character-subject",
  "processorVersion": "your-validated-model-version",
  "challenge": {
    "id": "server-challenge-id",
    "nonce": "server-random-value",
    "purpose": "verify",
    "poses": ["center", "blink"],
    "expiresAt": "ISO timestamp"
  },
  "frames": ["base64-center", "base64-closed-eyes", "base64-reopened-eyes"]
}
```

Enrollment adds the selected left/right frame. The processor must decode/validate the images, evaluate capture quality, check the challenge sequence/timing and PAD independently, create/use the correct enrolled template, reject replay and compare identity on verify. A landmark detector or changed image hashes alone cannot fulfill this contract. If its validated PAD requires a different capture protocol (for example continuous video), extend both contracts and tests before enabling it; do not claim these snapshots are sufficient for every PAD method.

Successful responses must bind `subject`, `challengeId` and `processorVersion` to the request, explicitly include `simulated: false` and `livenessPassed: true`, and return `enrolled: true` for enrollment or `facesCompared: true` and `matched: true|false` for verification. Missing/incorrect identity bindings fail closed. A mismatch remains a failed identity check. Only an actual matched verification updates `lastVerifiedAt`.

The opaque subject is keyed to beneficiary, consent, processor URL and model version. `BiometricProfile.templateHash` stores this subject reference for remote profiles, **not** a face embedding. The remote service owns template encryption, access control, audit, retention and deletion. Its lifecycle must honor consent withdrawal and expiry, including cleanup of failed/abandoned enrollments; local revocation immediately blocks use but does not itself delete a remotely stored template. Agree and implement that lifecycle before using real biometric data. Changing consent/model requires new enrollment. Existing simulated profiles are rejected in REMOTE mode.

The current API does not turn this general profile verification into an event-bound claim approval or wallet credit. Integrate the staff claim policy separately; never trust a client flag or a demo result.

The short-lived challenge store is per-process. A multi-instance deployment needs a shared atomic store, distributed throttling and provider-side replay protection. Current automated tests validate the adapter using synthetic responses, not real face/PAD accuracy.
