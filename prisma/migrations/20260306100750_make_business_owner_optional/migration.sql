-- DropForeignKey
ALTER TABLE "public"."Business" DROP CONSTRAINT "Business_ownerId_fkey";

-- AlterTable
ALTER TABLE "public"."Business" ALTER COLUMN "ownerId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."Business" ADD CONSTRAINT "Business_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
