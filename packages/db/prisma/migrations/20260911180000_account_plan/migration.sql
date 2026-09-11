CREATE TABLE "Account" (
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "source" TEXT NOT NULL DEFAULT 'signup',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX "Account_email_key" ON "Account"("email");
