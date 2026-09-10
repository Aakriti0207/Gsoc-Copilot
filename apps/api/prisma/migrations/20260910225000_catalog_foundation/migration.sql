-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CycleStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ParticipationStatus" AS ENUM ('ACTIVE', 'HISTORICAL');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('VERIFIED', 'REPORTED', 'INFERRED', 'STALE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('OPEN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RepositoryRole" AS ENUM ('PRIMARY', 'RELATED', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('OFFICIAL_PROGRAM', 'ORGANIZATION_SITE', 'GITHUB', 'CURATED_FIXTURE');

-- CreateTable
CREATE TABLE "programs" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_cycles" (
    "id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "starts_at" TIMESTAMPTZ(6),
    "ends_at" TIMESTAMPTZ(6),
    "status" "CycleStatus" NOT NULL,
    "official_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "program_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "website_url" TEXT,
    "github_org_login" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_participations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "program_cycle_id" UUID NOT NULL,
    "status" "ParticipationStatus" NOT NULL,
    "official_listing_url" TEXT,
    "source_status" "SourceStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organization_participations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "participation_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "normalized_title" TEXT NOT NULL,
    "description" TEXT,
    "size" TEXT,
    "proposal_url" TEXT,
    "status" "ProjectStatus" NOT NULL,
    "source_status" "SourceStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repositories" (
    "id" UUID NOT NULL,
    "github_repository_id" BIGINT NOT NULL,
    "owner_login" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner_login_normalized" TEXT NOT NULL,
    "name_normalized" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "default_branch" TEXT,
    "language_metrics" JSONB,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "last_synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_repositories" (
    "organization_id" UUID NOT NULL,
    "repository_id" UUID NOT NULL,
    "role" "RepositoryRole" NOT NULL,
    "source_id" UUID,

    CONSTRAINT "organization_repositories_pkey" PRIMARY KEY ("organization_id","repository_id")
);

-- CreateTable
CREATE TABLE "project_repositories" (
    "project_id" UUID NOT NULL,
    "repository_id" UUID NOT NULL,
    "role" "RepositoryRole" NOT NULL,
    "source_id" UUID,

    CONSTRAINT "project_repositories_pkey" PRIMARY KEY ("project_id","repository_id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "source_type" "SourceType" NOT NULL,
    "retrieved_at" TIMESTAMPTZ(6) NOT NULL,
    "content_hash" TEXT,
    "reliability_tier" INTEGER NOT NULL,
    "is_development_fixture" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fact_assertions" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "extraction_method" TEXT NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "verification_state" "SourceStatus" NOT NULL,

    CONSTRAINT "fact_assertions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "programs_slug_key" ON "programs"("slug");

-- CreateIndex
CREATE INDEX "program_cycles_program_id_status_idx" ON "program_cycles"("program_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "program_cycles_program_id_year_key" ON "program_cycles"("program_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_github_org_login_key" ON "organizations"("github_org_login");

-- CreateIndex
CREATE INDEX "organization_participations_program_cycle_id_status_idx" ON "organization_participations"("program_cycle_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "organization_participations_organization_id_program_cycle_i_key" ON "organization_participations"("organization_id", "program_cycle_id");

-- CreateIndex
CREATE INDEX "projects_participation_id_status_idx" ON "projects"("participation_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "projects_participation_id_normalized_title_key" ON "projects"("participation_id", "normalized_title");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_github_repository_id_key" ON "repositories"("github_repository_id");

-- CreateIndex
CREATE INDEX "repositories_archived_last_synced_at_idx" ON "repositories"("archived", "last_synced_at");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_owner_login_normalized_name_normalized_key" ON "repositories"("owner_login_normalized", "name_normalized");

-- CreateIndex
CREATE INDEX "organization_repositories_repository_id_idx" ON "organization_repositories"("repository_id");

-- CreateIndex
CREATE INDEX "project_repositories_repository_id_idx" ON "project_repositories"("repository_id");

-- CreateIndex
CREATE UNIQUE INDEX "sources_url_key" ON "sources"("url");

-- CreateIndex
CREATE UNIQUE INDEX "sources_content_hash_key" ON "sources"("content_hash");

-- CreateIndex
CREATE INDEX "fact_assertions_entity_type_entity_id_field_observed_at_idx" ON "fact_assertions"("entity_type", "entity_id", "field", "observed_at");

-- CreateIndex
CREATE INDEX "fact_assertions_source_id_idx" ON "fact_assertions"("source_id");

-- AddForeignKey
ALTER TABLE "program_cycles" ADD CONSTRAINT "program_cycles_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_participations" ADD CONSTRAINT "organization_participations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_participations" ADD CONSTRAINT "organization_participations_program_cycle_id_fkey" FOREIGN KEY ("program_cycle_id") REFERENCES "program_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_participation_id_fkey" FOREIGN KEY ("participation_id") REFERENCES "organization_participations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_repositories" ADD CONSTRAINT "organization_repositories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_repositories" ADD CONSTRAINT "organization_repositories_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_repositories" ADD CONSTRAINT "organization_repositories_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_repositories" ADD CONSTRAINT "project_repositories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_repositories" ADD CONSTRAINT "project_repositories_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_repositories" ADD CONSTRAINT "project_repositories_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fact_assertions" ADD CONSTRAINT "fact_assertions_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

