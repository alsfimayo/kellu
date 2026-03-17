/*
  Warnings:

  - You are about to drop the column `quoteId` on the `LineItem` table. All the data in the column will be lost.
  - You are about to drop the `Quote` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."LineItem" DROP CONSTRAINT "LineItem_quoteId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Quote" DROP CONSTRAINT "Quote_assignedToId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Quote" DROP CONSTRAINT "Quote_businessId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Quote" DROP CONSTRAINT "Quote_clientId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Quote" DROP CONSTRAINT "Quote_workOrderId_fkey";

-- DropIndex
DROP INDEX "public"."LineItem_quoteId_idx";

-- AlterTable
ALTER TABLE "public"."LineItem" DROP COLUMN "quoteId";

-- DropTable
DROP TABLE "public"."Quote";
