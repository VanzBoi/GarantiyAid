-- Some DSWD programs have no fixed grant amount; staff set it when they plan a distribution.
ALTER TABLE "programs" ALTER COLUMN "grant_amount" DROP NOT NULL;

-- Programs a beneficiary reports at sign-up stay pending until staff confirm membership.
ALTER TABLE "enrollments" ADD COLUMN "source" VARCHAR(16) NOT NULL DEFAULT 'staff';
ALTER TABLE "enrollments" ADD COLUMN "requested_program_name" VARCHAR(120);
ALTER TABLE "enrollments" ADD COLUMN "member_reference" VARCHAR(40);
