-- Phones where the beneficiary turned on face login. Each phone holds a random secret (only its hash is
-- stored here); face login needs that phone plus a face capture, never just a mobile number.
CREATE TABLE "face_login_devices" (
    "device_id" UUID NOT NULL,
    "beneficiary_id" UUID NOT NULL,
    "secret_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    CONSTRAINT "face_login_devices_pkey" PRIMARY KEY ("device_id")
);
CREATE INDEX "face_login_devices_beneficiary_id_idx" ON "face_login_devices"("beneficiary_id");
ALTER TABLE "face_login_devices" ADD CONSTRAINT "face_login_devices_beneficiary_id_fkey"
  FOREIGN KEY ("beneficiary_id") REFERENCES "beneficiaries"("beneficiary_id") ON DELETE CASCADE ON UPDATE CASCADE;
