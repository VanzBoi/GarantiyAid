-- Valid ID chosen during mobile registration. The ID photo itself is saved as a beneficiary document.
ALTER TABLE "beneficiaries" ADD COLUMN "valid_id_type" VARCHAR(32);
ALTER TABLE "beneficiaries" ADD COLUMN "valid_id_number" VARCHAR(40);
