/*
  Warnings:

  - Made the column `contractTypes` on table `ClauseLibrary` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "ClauseLibrary" ALTER COLUMN "contractTypes" SET NOT NULL;

-- AlterTable
ALTER TABLE "Contract" ALTER COLUMN "recordNumber" DROP DEFAULT,
ALTER COLUMN "requesterName" DROP DEFAULT,
ALTER COLUMN "requesterEmail" DROP DEFAULT,
ALTER COLUMN "contractType" DROP DEFAULT,
ALTER COLUMN "title" DROP DEFAULT;
