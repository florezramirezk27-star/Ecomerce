-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionExpiresAt" TIMESTAMP(3),
ADD COLUMN     "sessionId" TEXT;
