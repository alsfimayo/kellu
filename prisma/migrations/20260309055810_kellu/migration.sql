/*
  Warnings:

  - You are about to drop the column `companyRut` on the `Business` table. All the data in the column will be lost.
  - You are about to drop the column `countryId` on the `Business` table. All the data in the column will be lost.
  - You are about to drop the column `taxId` on the `Business` table. All the data in the column will be lost.
  - You are about to drop the column `taxRate` on the `Business` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Business" DROP COLUMN "companyRut",
DROP COLUMN "countryId",
DROP COLUMN "taxId",
DROP COLUMN "taxRate";
