-- CreateTable
CREATE TABLE "AgentState" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentState_pkey" PRIMARY KEY ("key")
);
