-- CreateEnum
CREATE TYPE "Role" AS ENUM ('COMPANY', 'ADMIN');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('SHORTLISTED', 'NEGOTIATING', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "NegotiationStatus" AS ENUM ('ACTIVE', 'ACCEPTED', 'REJECTED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('OUTREACH_SENT', 'REPLY_RECEIVED', 'INTENT_CLASSIFIED', 'DECISION_MADE', 'EMAIL_SENT', 'STOP_CONDITION', 'DEAL_CLOSED');

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'COMPANY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "teamSize" INTEGER NOT NULL,
    "budgetInr" INTEGER NOT NULL,
    "preferredArea" TEXT NOT NULL,
    "mustHaves" TEXT NOT NULL,
    "priceFloorPct" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "companyProfileId" TEXT NOT NULL,
    "status" "DealStatus" NOT NULL DEFAULT 'SHORTLISTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShortlistItem" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "breakdown" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,

    CONSTRAINT "ShortlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Negotiation" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "landlordEmail" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "status" "NegotiationStatus" NOT NULL DEFAULT 'ACTIVE',
    "askingPriceInr" INTEGER NOT NULL,
    "currentOfferInr" INTEGER NOT NULL,
    "roundCount" INTEGER NOT NULL DEFAULT 0,
    "priceMovementRounds" INTEGER NOT NULL DEFAULT 0,
    "lastLandlordOfferInr" INTEGER,
    "noMovementStreak" INTEGER NOT NULL DEFAULT 0,
    "lastConcessionFeaturesJson" TEXT,
    "lastConcessionFraction" DOUBLE PRECISION,
    "lastMessageId" TEXT,
    "lastPolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Negotiation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NegotiationEvent" (
    "id" TEXT NOT NULL,
    "negotiationId" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NegotiationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_email_key" ON "Profile"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Negotiation_threadId_key" ON "Negotiation"("threadId");

-- CreateIndex
CREATE INDEX "NegotiationEvent_negotiationId_idx" ON "NegotiationEvent"("negotiationId");

-- AddForeignKey
ALTER TABLE "CompanyProfile" ADD CONSTRAINT "CompanyProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_companyProfileId_fkey" FOREIGN KEY ("companyProfileId") REFERENCES "CompanyProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShortlistItem" ADD CONSTRAINT "ShortlistItem_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Negotiation" ADD CONSTRAINT "Negotiation_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegotiationEvent" ADD CONSTRAINT "NegotiationEvent_negotiationId_fkey" FOREIGN KEY ("negotiationId") REFERENCES "Negotiation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
