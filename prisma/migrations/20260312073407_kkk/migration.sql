/*
  Warnings:

  - A unique constraint covering the columns `[businessId,workOrderNumber]` on the table `WorkOrder` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_businessId_workOrderNumber_key" ON "public"."WorkOrder"("businessId", "workOrderNumber");
