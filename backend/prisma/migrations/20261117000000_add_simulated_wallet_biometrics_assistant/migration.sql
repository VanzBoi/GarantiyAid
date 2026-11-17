-- Simulated wallet activity (credits and transfers) is not tied to a claim.
ALTER TABLE "transactions" ALTER COLUMN "claim_id" DROP NOT NULL;
ALTER TABLE "transactions" ADD COLUMN "counterparty_wallet_id" UUID;
ALTER TABLE "transactions" ADD COLUMN "note" VARCHAR(160);
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_counterparty_wallet_id_fkey"
  FOREIGN KEY ("counterparty_wallet_id") REFERENCES "wallet_accounts"("wallet_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Human-readable wallet number used for simulated transfers and wallet QR codes.
ALTER TABLE "wallet_accounts" ADD COLUMN "wallet_number" VARCHAR(16);
UPDATE "wallet_accounts"
  SET "wallet_number" = 'GA-' || upper(substr(replace("wallet_id"::text, '-', ''), 1, 8))
  WHERE "wallet_number" IS NULL;
ALTER TABLE "wallet_accounts" ALTER COLUMN "wallet_number" SET NOT NULL;
CREATE UNIQUE INDEX "wallet_accounts_wallet_number_key" ON "wallet_accounts"("wallet_number");

-- Biometric consent and simulated self-capture enrollment. Face images are never stored.
CREATE TABLE "biometric_consents" (
    "consent_id" UUID NOT NULL,
    "beneficiary_id" UUID NOT NULL,
    "version" VARCHAR(16) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "consented_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "retention_until" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "biometric_consents_pkey" PRIMARY KEY ("consent_id")
);
CREATE INDEX "biometric_consents_beneficiary_id_status_idx" ON "biometric_consents"("beneficiary_id", "status");
ALTER TABLE "biometric_consents" ADD CONSTRAINT "biometric_consents_beneficiary_id_fkey"
  FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("beneficiary_id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "biometric_profiles" (
    "profile_id" UUID NOT NULL,
    "beneficiary_id" UUID NOT NULL,
    "consent_id" UUID NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'enrolled',
    "simulated" BOOLEAN NOT NULL DEFAULT true,
    "processor_compatible" BOOLEAN NOT NULL DEFAULT true,
    "template_hash" CHAR(64) NOT NULL,
    "liveness_passed" BOOLEAN NOT NULL DEFAULT false,
    "enrolled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_verified_at" TIMESTAMPTZ(6),
    CONSTRAINT "biometric_profiles_pkey" PRIMARY KEY ("profile_id")
);
CREATE UNIQUE INDEX "biometric_profiles_beneficiary_id_key" ON "biometric_profiles"("beneficiary_id");
ALTER TABLE "biometric_profiles" ADD CONSTRAINT "biometric_profiles_beneficiary_id_fkey"
  FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("beneficiary_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "biometric_profiles" ADD CONSTRAINT "biometric_profiles_consent_id_fkey"
  FOREIGN KEY ("consent_id") REFERENCES "biometric_consents"("consent_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Saved assistant (chatbot) conversation history.
CREATE TABLE "assistant_messages" (
    "message_id" UUID NOT NULL,
    "beneficiary_id" UUID NOT NULL,
    "role" VARCHAR(16) NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assistant_messages_pkey" PRIMARY KEY ("message_id")
);
CREATE INDEX "assistant_messages_beneficiary_id_created_at_idx" ON "assistant_messages"("beneficiary_id", "created_at");
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_beneficiary_id_fkey"
  FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("beneficiary_id") ON DELETE CASCADE ON UPDATE CASCADE;
