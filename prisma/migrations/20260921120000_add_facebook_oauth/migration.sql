-- AlterTable
ALTER TABLE "User" ADD COLUMN "facebookId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_facebookId_key" ON "User"("facebookId");