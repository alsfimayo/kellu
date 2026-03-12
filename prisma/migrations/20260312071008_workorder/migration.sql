/*
  Warnings:

  - A unique constraint covering the columns `[workOrderNumber]` on the table `WorkOrder` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."WorkOrder_businessId_workOrderNumber_key";

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_workOrderNumber_key" ON "public"."WorkOrder"("workOrderNumber");
