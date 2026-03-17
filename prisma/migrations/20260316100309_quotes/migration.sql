-- AlterTable
ALTER TABLE "public"."LineItem" ADD COLUMN     "quoteId" TEXT;

-- CreateTable
CREATE TABLE "public"."Quote" (
    "id" TEXT NOT NULL,
    "quoteNumber" TEXT,
    "title" TEXT NOT NULL,
    "address" TEXT,
    "status" "public"."QuoteStatus" NOT NULL DEFAULT 'NOT_SENT',
    "sentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "subtotal" DECIMAL(12,2),
    "discount" DECIMAL(12,2),
    "discountType" "public"."DiscountType",
    "tax" DECIMAL(12,2),
    "total" DECIMAL(12,2),
    "termsConditions" TEXT,
    "observations" TEXT,
    "whatsappStatus" TEXT,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "workOrderId" TEXT,
    "assignedToId" TEXT,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Quote_businessId_quoteNumber_key" ON "public"."Quote"("businessId", "quoteNumber");

-- CreateIndex
CREATE INDEX "LineItem_quoteId_idx" ON "public"."LineItem"("quoteId");

-- AddForeignKey
ALTER TABLE "public"."Quote" ADD CONSTRAINT "Quote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Quote" ADD CONSTRAINT "Quote_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Quote" ADD CONSTRAINT "Quote_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "public"."WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Quote" ADD CONSTRAINT "Quote_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "public"."Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LineItem" ADD CONSTRAINT "LineItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "public"."Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
