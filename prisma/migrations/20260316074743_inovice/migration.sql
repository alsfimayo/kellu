-- AlterTable
ALTER TABLE "public"."LineItem" ADD COLUMN     "invoiceId" TEXT;

-- AlterTable
ALTER TABLE "public"."Payment" ADD COLUMN     "invoiceId" TEXT,
ALTER COLUMN "workOrderId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "public"."Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "title" TEXT NOT NULL,
    "address" TEXT,
    "status" "public"."InvoiceStatus" NOT NULL DEFAULT 'NOT_SENT',
    "sentAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "badDebtAt" TIMESTAMP(3),
    "subtotal" DECIMAL(12,2),
    "discount" DECIMAL(12,2),
    "discountType" "public"."DiscountType",
    "tax" DECIMAL(12,2),
    "total" DECIMAL(12,2),
    "amountPaid" DECIMAL(12,2) DEFAULT 0,
    "balance" DECIMAL(12,2),
    "whatsappStatus" TEXT,
    "observations" TEXT,
    "termsConditions" TEXT,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "workOrderId" TEXT,
    "assignedToId" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_businessId_invoiceNumber_key" ON "public"."Invoice"("businessId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "LineItem_workOrderId_idx" ON "public"."LineItem"("workOrderId");

-- CreateIndex
CREATE INDEX "LineItem_invoiceId_idx" ON "public"."LineItem"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_workOrderId_idx" ON "public"."Payment"("workOrderId");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "public"."Payment"("invoiceId");

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "public"."WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "public"."Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LineItem" ADD CONSTRAINT "LineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
