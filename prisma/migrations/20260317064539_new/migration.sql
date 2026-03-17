/*
  Warnings:

  - The values [ALL] on the enum `ClientStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [All] on the enum `LeadSource` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `roleId` on the `User` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "public"."ClientStatus_new" AS ENUM ('ACTIVE', 'ARCHIVED', 'FOLLOW_UP');
ALTER TABLE "public"."Client" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."Client" ALTER COLUMN "status" TYPE "public"."ClientStatus_new" USING ("status"::text::"public"."ClientStatus_new");
ALTER TYPE "public"."ClientStatus" RENAME TO "ClientStatus_old";
ALTER TYPE "public"."ClientStatus_new" RENAME TO "ClientStatus";
DROP TYPE "public"."ClientStatus_old";
ALTER TABLE "public"."Client" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "public"."LeadSource_new" AS ENUM ('Website', 'SocialMedia', 'Referral', 'Other');
ALTER TABLE "public"."Client" ALTER COLUMN "leadSource" DROP DEFAULT;
ALTER TABLE "public"."Client" ALTER COLUMN "leadSource" TYPE "public"."LeadSource_new" USING ("leadSource"::text::"public"."LeadSource_new");
ALTER TYPE "public"."LeadSource" RENAME TO "LeadSource_old";
ALTER TYPE "public"."LeadSource_new" RENAME TO "LeadSource";
DROP TYPE "public"."LeadSource_old";
ALTER TABLE "public"."Client" ALTER COLUMN "leadSource" SET DEFAULT 'Website';
COMMIT;

-- DropForeignKey
ALTER TABLE "public"."User" DROP CONSTRAINT "User_roleId_fkey";

-- AlterTable
ALTER TABLE "public"."Business" ADD COLUMN     "rutNumber" TEXT;

-- AlterTable
ALTER TABLE "public"."BusinessSettings" ADD COLUMN     "defaultTaxRate" DECIMAL(5,2),
ADD COLUMN     "rutNumber" TEXT;

-- AlterTable
ALTER TABLE "public"."Invoice" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "public"."Quote" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "public"."ReminderLog" ADD COLUMN     "workOrderId" TEXT;

-- AlterTable
ALTER TABLE "public"."Task" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "isCompleted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "roleId";

-- AlterTable
ALTER TABLE "public"."WorkOrder" ADD COLUMN     "confirmationReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "quoteVersion" INTEGER NOT NULL DEFAULT 1;

-- DropEnum
DROP TYPE "public"."WorkOrderType";

-- AddForeignKey
ALTER TABLE "public"."ReminderLog" ADD CONSTRAINT "ReminderLog_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "public"."WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
