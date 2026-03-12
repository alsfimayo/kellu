-- Drop global unique on workOrderNumber (was causing collisions across businesses)
DROP INDEX IF EXISTS "public"."WorkOrder_workOrderNumber_key";

-- Unique per business: each business has its own #1, #2, #3...
CREATE UNIQUE INDEX "WorkOrder_businessId_workOrderNumber_key" ON "public"."WorkOrder"("businessId", "workOrderNumber");
