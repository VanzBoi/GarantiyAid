-- Staff accounts for the distribution-day scanner page (/staff). Created with `npm run staff:create`.
CREATE TABLE "staff" (
    "staff_id" UUID NOT NULL,
    "username" VARCHAR(40) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMPTZ(6),
    CONSTRAINT "staff_pkey" PRIMARY KEY ("staff_id")
);
CREATE UNIQUE INDEX "staff_username_key" ON "staff"("username");

CREATE TABLE "staff_sessions" (
    "session_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_sessions_pkey" PRIMARY KEY ("session_id")
);
CREATE UNIQUE INDEX "staff_sessions_token_hash_key" ON "staff_sessions"("token_hash");
CREATE INDEX "staff_sessions_staff_id_idx" ON "staff_sessions"("staff_id");
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_staff_id_fkey"
  FOREIGN KEY ("staff_id") REFERENCES "staff"("staff_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Who released a claim and who decided an enrollment, for accountability.
ALTER TABLE "claims" ADD COLUMN "released_by_staff_id" UUID;
ALTER TABLE "claims" ADD CONSTRAINT "claims_released_by_staff_id_fkey"
  FOREIGN KEY ("released_by_staff_id") REFERENCES "staff"("staff_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "enrollments" ADD COLUMN "reviewed_at" TIMESTAMPTZ(6);
ALTER TABLE "enrollments" ADD COLUMN "reviewed_by_staff_id" UUID;
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_reviewed_by_staff_id_fkey"
  FOREIGN KEY ("reviewed_by_staff_id") REFERENCES "staff"("staff_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Amount recorded in the wallet for each release at this distribution (falls back to the program amount).
ALTER TABLE "distributions" ADD COLUMN "amount" DECIMAL(12,2);
