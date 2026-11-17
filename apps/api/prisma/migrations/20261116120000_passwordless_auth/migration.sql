-- CreateEnum
CREATE TYPE "AuthChallengePurpose" AS ENUM ('LOGIN', 'SIGNUP');

-- CreateEnum
CREATE TYPE "AuthMethod" AS ENUM ('PASSWORD', 'GOOGLE', 'EMAIL_LINK');

-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('GOOGLE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordLoginEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "profileCompletedAt" TIMESTAMP(3),
ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AuthChallenge" (
    "id" TEXT NOT NULL,
    "purpose" "AuthChallengePurpose" NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "linkTokenHash" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "browserNonceHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "returnPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "AuthProvider" NOT NULL,
    "subject" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentGrant" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "method" "AuthMethod" NOT NULL,
    "googleSubject" TEXT,
    "browserNonceHash" TEXT NOT NULL,
    "returnPath" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrollmentGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthChallenge_linkTokenHash_key" ON "AuthChallenge"("linkTokenHash");

-- CreateIndex
CREATE INDEX "AuthChallenge_email_createdAt_idx" ON "AuthChallenge"("email", "createdAt");

-- CreateIndex
CREATE INDEX "AuthChallenge_userId_purpose_createdAt_idx" ON "AuthChallenge"("userId", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "AuthChallenge_expiresAt_idx" ON "AuthChallenge"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthIdentity_provider_subject_key" ON "AuthIdentity"("provider", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "AuthIdentity_userId_provider_key" ON "AuthIdentity"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentGrant_tokenHash_key" ON "EnrollmentGrant"("tokenHash");

-- CreateIndex
CREATE INDEX "EnrollmentGrant_email_createdAt_idx" ON "EnrollmentGrant"("email", "createdAt");

-- CreateIndex
CREATE INDEX "EnrollmentGrant_expiresAt_idx" ON "EnrollmentGrant"("expiresAt");

-- CreateIndex
CREATE INDEX "EnrollmentGrant_userId_idx" ON "EnrollmentGrant"("userId");

-- AddForeignKey
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthIdentity" ADD CONSTRAINT "AuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentGrant" ADD CONSTRAINT "EnrollmentGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
