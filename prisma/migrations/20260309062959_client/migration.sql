/*
  Warnings:

  - Added the required column `zipcode` to the `Business` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Business" ADD COLUMN     "countyId" TEXT,
ADD COLUMN     "state" TEXT,
ADD COLUMN     "zipcode" TEXT NOT NULL;
