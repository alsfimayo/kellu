-- Add unique constraint to prevent duplicate sends across overlapping dispatch runs.
--
-- This is primarily used by booking-confirmation reminders where we store:
--   reminderType = 'BOOKING_CONFIRMATION'
--   workOrderId  = <work order id>
--   note         = 'configId:<ReminderConfig.id>'
--
-- If you already have duplicate rows in production/dev DB, you must delete duplicates before applying.

ALTER TABLE "ReminderLog"
ADD CONSTRAINT "ReminderLog_businessId_reminderType_workOrderId_note_key"
UNIQUE ("businessId", "reminderType", "workOrderId", "note");

