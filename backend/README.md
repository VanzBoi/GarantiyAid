# Garantiy-Aid backend

This is the real-data API for the beneficiary mobile app. It implements account access, the signed-in beneficiary profile, program enrollments, the next assigned distribution schedule, scoped QR claim-pass issuance, read-only claim and assistance-ledger history, and saved in-app notifications. Data is stored in PostgreSQL through Prisma.

## Run locally

Run these commands from `backend/`. Keep an existing configured `.env`; create it from the example only on a first setup.

1. Install the packages, prepare the environment file, and start Prisma's local PostgreSQL server:

```powershell
npm install
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm run db:local
```

2. In `.env`, set `DATABASE_URL` to the **direct `postgres://` URL** printed by `db:local`, rather than its `prisma+postgres://` URL. The driver in this project connects directly to PostgreSQL. On a first setup, replace the example `AUTH_PEPPER` with a random secret of at least 32 characters; preserve an existing configured secret.

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

3. Generate the Prisma client, apply the included migrations, seed local example records, and start the API:

```powershell
npm run db:generate
npm run db:deploy
npm run db:seed
npm run db:seed:barangays
npm run dev
```

`db:seed:barangays` loads the official PSGC list of 3,003 barangays in Region VII (Bohol, Cebu, Negros Oriental, Siquijor) from `prisma/data/region7-barangays.json`. The mobile address picker groups them by province and city. Re-running it is safe.

If the project folder is synced by OneDrive, the database can fail to start with `PGlite failed to initialize properly` because OneDrive turns its files into online-only placeholders. Add `LOCAL_DB_DIR=C:/Users/<you>/.garantiyaid` to `.env` to keep the database outside the synced folder, then run `npm run db:local` again.

### Hosted demo on Railway

The demo API runs on Railway with a Railway PostgreSQL database. It was deployed from this folder with the Railway CLI (`railway up --service backend`), not from GitHub. The `backend` service variables are:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `AUTH_PEPPER` | A random secret of at least 32 characters, kept only in Railway |
| `NODE_ENV` | `development`, so the OTP appears on screen while SMS is not connected |
| `RAILPACK_START_CMD` | `npm run deploy:prepare && npm start` |

`deploy:prepare` applies migrations and loads the barangay list on every start. Demo accounts were seeded once. Uploaded documents are saved on the container disk and are lost on redeploy. Because `NODE_ENV=development` returns login codes to the caller, use this deployment only for testing with demo data.

The seed is for local testing and resets its example records to the values in `src/seed.ts`. Keep `CORS_ORIGINS=http://localhost:8765,http://127.0.0.1:8765` when using the documented browser preview. Do not commit the private `.env` file.

The API listens at `http://localhost:3000`. `GET /health` confirms that PostgreSQL is connected. The seed creates the verified mobile test account `0917 555 0147` with an approved 4Ps enrollment, a schedule dated October 2, 2026, and one completed claim with a posted PHP 1,500 assistance entry. The schedule has expired as of October 19, 2026, so the account correctly has no upcoming schedule or available QR pass. The fixed seed does not advance dates automatically.

During development, OTP codes are printed in the backend terminal and returned as `developmentOtp` in the response. Production never returns or logs the code; an SMS provider must be connected before production use.

### Real SMS codes (Semaphore)

Set these variables (on Railway: the `backend` service › Variables) and redeploy:

| Variable | Value |
| --- | --- |
| `SMS_PROVIDER` | `semaphore` |
| `SEMAPHORE_API_KEY` | Your key from the Semaphore dashboard. Keep it private. |
| `SEMAPHORE_SENDER_NAME` | Optional. Only a sender name Semaphore has approved; leave unset to use your account's default. |
| `SMS_DAILY_LIMIT` | Optional safety cap, default 300 codes per day. |

Codes go through Semaphore's OTP route (priority delivery, 2 credits per text). With SMS on, the API never returns the code, sign-up, password reset and the remaining code requests are texted, and email verification is paused until an email sender exists. Each network can request 5 codes per 10 minutes. If Semaphore fails, no code is saved and the person can retry immediately.

## Implemented endpoints

- `GET /health`
- `GET /barangays`
- `POST /auth/register`
- `POST /auth/otp/request`
- `POST /auth/otp/verify`
- `POST /auth/logout`
- `GET /beneficiaries/me`
- `PATCH /beneficiaries/me`
- `GET /beneficiaries/me/documents`
- `POST /beneficiaries/me/documents`
- `GET /beneficiaries/me/documents/:documentId/content`
- `GET /beneficiaries/me/overview`
- `GET /beneficiaries/me/wallet`
- `GET /beneficiaries/me/notifications`
- `PATCH /beneficiaries/me/notifications/:notificationId/read`
- `POST /beneficiaries/me/claim-pass`
- `POST /auth/password/login`, `PUT /beneficiaries/me/password`
- `POST /auth/password/reset/request`, `POST /auth/password/reset`
- `POST /beneficiaries/me/email`, `POST /beneficiaries/me/email/verify`
- `POST /beneficiaries/me/wallet`, `POST /beneficiaries/me/wallet/simulated-credits`
- `GET /beneficiaries/me/wallet/recipients/:walletNumber`, `POST /beneficiaries/me/wallet/simulated-transfers`
- `GET /beneficiaries/me/biometrics`, `POST /beneficiaries/me/biometric-consents`, `POST /beneficiaries/me/biometric-consents/:consentId/revoke`
- `POST /beneficiaries/me/biometrics/enrollment`, `POST /beneficiaries/me/biometrics/verification`
- `GET /programs`, `POST /beneficiaries/me/enrollments` (DSWD program chosen at sign-up; always saved as `pending` with `source = mobile` until staff confirm it)
- `POST /beneficiaries/me/assistant/reply` (AI help assistant)

### Staff scanner page (distribution day)

Open `/staff` on the API (for example `https://<your-railway-domain>/staff`) on a laptop or phone. Staff can:

1. **Scan QR**: start the camera (or type the code), check the beneficiary's name, birth date, barangay, ID photo and queue, then **Release**. The release marks the claim completed, uses the QR pass once, records the amount in the beneficiary's wallet as an `assistance_credit`, and sends an in-app notification. Scanning the same pass again is refused. The wallet entry is a record of assistance handed over; no money moves through this API.
2. **Enrollments**: approve or reject the programs beneficiaries chose at sign-up.
3. **Distributions**: create a distribution day for a program. Every approved member gets a queue number, a time slot and a notification.

Create a staff account (the password comes from the environment, not the command line):

```bash
STAFF_PASSWORD='choose-a-long-password-2026' npm run staff:create -- jdelacruz "Juan Dela Cruz"
```

On Railway, run it from the service shell. Running it again for the same username changes the password and ends that person's sessions. The camera needs HTTPS (Railway provides it) or `localhost`.

### AI help assistant

The Help tab's assistant answers any question in Bisaya, English or Tagalog using Claude (`claude-opus-5-5`, effort `medium`, with server-side refusal fallback enabled). Each reply is grounded in the signed-in beneficiary's own records: first name, barangay, programs and their status, schedules, recent claims, uploaded document types and face-verification status. Phone number, street address and ID number are not sent. Requests are limited to 30 per beneficiary per 10 minutes.

Set `ANTHROPIC_API_KEY` in `.env` (or Railway variables) to turn it on. Without it, the endpoint returns `503 ASSISTANT_UNAVAILABLE` and the app falls back to its basic saved-record answers. Mention in your privacy notice that questions and the record summary are sent to Anthropic to generate replies.
- `GET`, `POST`, `DELETE /beneficiaries/me/assistant/messages`

### Password, email, simulated wallet, simulated face, and assistant history

These routes live in `src/extended.ts` and need migration `20261117000000_add_simulated_wallet_biometrics_assistant`.

- **Passwords** are optional. They are hashed with scrypt in the existing `password_hash` column, need 8–128 characters with a letter and a number, and lock for 15 minutes after five wrong attempts per number. Changing a password signs out other sessions; a reset (SMS code purpose `reset`) signs out every session.
- **Email** uses the existing `email` column. The six-digit code is bound to the address that requested it. Development responses return `developmentOtp` because email delivery is not connected.
- **Wallet** activity is a simulation. Verified accounts can create a wallet (number `GA-XXXXXXXX`), add simulated credit (₱1–₱5,000 per request, ₱50,000 cap), and send simulated transfers to another active wallet (₱1–₱5,000). Each request carries a `requestId` so retries apply once. Simulated entries have no claim and are labelled `simulated: true`. No real money is held or moved.
- **Face capture** uses a simulated processor. The app sends three photos for enrollment (two for verification) after consent. The server checks that they are distinct images (prompt completion), keeps only an HMAC of one photo's hash, and discards the photos. It never compares faces or detects spoofing; verification returns `result: "simulated_match"` with `facesCompared: false`.
- **Assistant history** stores the questions and automated answers shown in Help, per account, and can be cleared.

The seed adds a second verified demo account, `0917 555 0148`, with an empty wallet to receive simulated transfers. Both wallet numbers are printed when seeding.

Protected endpoints use `Authorization: Bearer <accessToken>`. Access tokens are random, stored only as hashes, expire after seven days, and are revoked by logout.

`PATCH /beneficiaries/me` accepts partial updates containing only `firstName`, `middleName`, `lastName`, `address`, and `barangayId`; it returns the updated public profile. Names are trimmed, support Unicode letters and common punctuation, and have a 100-character limit. A blank/null middle name clears it. Addresses must have 5–500 trimmed characters. A different barangay must be active; an existing inactive barangay may be retained while correcting other details. Empty payloads, unsupported/protected fields, and invalid values return 422. Mobile number, birth date, sex, verification, and account status cannot be changed here. These edits do not reassign programs or schedules.

Claim passes are opaque, distribution-scoped values returned only when issued. PostgreSQL stores a keyed hash rather than the raw QR value. Issuing a replacement revokes the previous active pass, and each pass expires at the end of its assigned schedule. Staff-side scanning and claim approval remain separate work.

`GET /beneficiaries/me/wallet` returns the signed-in beneficiary's wallet-account summary, current scheduled claim status, claim history, and posted transaction receipts. The wallet is an assistance ledger for recorded distributions; it does not hold funds or initiate transfers. Mobile access is read-only. A later staff workflow must verify a claim and create its claim and transaction records together in one atomic database operation.

The notification inbox returns only the signed-in beneficiary's `in_app` records with delivery `status: sent` and a `sentAt` timestamp that has arrived, newest first. Read state is separate: `readAt: null` means unread. The PATCH endpoint preserves the first read timestamp on retries and returns 404 for another account's message, an unknown ID, or a message that is not in the inbox. Malformed UUIDs return 422. There is no beneficiary endpoint for creating messages or changing delivery status.

The seed adds a historical schedule message and a claim message labeled **Demo**, linked to its existing schedules. Re-running the seed preserves their read timestamps. Real schedule/claim messages must be created by the team's authorized staff backend, in the same transaction as the event they describe; it must check that the linked schedule belongs to the recipient. Automatic event generation, SMS, and OS push delivery are not implemented.

Documents are stored privately in `backend/storage/documents/` by default. This directory is ignored by Git and is never served as a public static folder. Optional `DOCUMENT_STORAGE_DIR` changes the location; relative paths resolve from `backend/`. Uploaded files use server-generated UUID names, while PostgreSQL stores the original display name, category, MIME type, size, content hash, received status, and upload time. The signed-in beneficiary is both recipient and uploader for these self-service uploads; staff-user upload attribution remains part of the future shared backend.

Uploads send the raw file bytes with `Content-Type: application/pdf`, `image/jpeg`, or `image/png`, plus `X-File-Name: <encodeURIComponent(originalName)>` and `X-Document-Type: proof_of_residency`, `valid_id`, or `other`. The limit is 5 MiB (shown as 5 MB in the app). Empty files, unsafe names, unsupported categories, and mismatched file signatures/extensions are rejected. A successful upload returns 201; retrying identical contents in the same category/account returns the existing record with 200. Concurrent retries are deduplicated by a database constraint, and failed writes remove their newly created file.

The list and upload responses expose `id`, `docType`, `originalName`, `mimeType`, `sizeBytes`, `status`, and `createdAt`; storage keys and hashes stay private. Content downloads require the owner's bearer token and use attachment, `nosniff`, and no-store headers. Another account receives 404. Uploading does not change enrollment or verify identity. These are intake categories, not a determination of official requirements; staff review and authenticity/malware checks are not implemented.

This storage approach targets one local API instance. Back up the database and private files together. Shared deployment, file preview UI, staff review, and account-deletion/retention cleanup remain later work; deleting a database record outside the API does not remove its file automatically.

Run `npm test` and `npm run typecheck` for the regular checks. With local PostgreSQL running and migrations applied, run `npm run test:integration` to verify notifications, profile editing, and private document intake. Document checks use a fresh temporary directory and synthetic files; they cover invalid/oversized uploads, ownership, exact downloaded bytes, repeated/concurrent deduplication, no public storage route, and persistence across sessions. Test records and files are removed afterward.
