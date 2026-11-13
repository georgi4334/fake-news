-- AlterTable
ALTER TABLE "Analysis" ADD COLUMN     "images" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "ImageArtifact" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImageArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImageArtifact_analysisId_index_kind_key" ON "ImageArtifact"("analysisId", "index", "kind");
