import { PrismaClient, ProjectStatus, RepositoryRole, SourceStatus, SourceType } from "@prisma/client";

const prisma = new PrismaClient();
const fixtureDate = new Date("2026-01-15T00:00:00.000Z");

const organizations = [
  ["alpha-tools", "Alpha Tools", "alpha-tools"],
  ["civic-code", "Civic Code", "civic-code"],
  ["data-forge", "Data Forge", "data-forge"],
  ["open-labs", "Open Labs", "open-labs"],
  ["science-stack", "Science Stack", "science-stack"],
] as const;

async function main() {
  const source = await prisma.source.upsert({
    where: { url: "https://fixtures.invalid/gsoc-catalog-development" },
    update: { retrievedAt: fixtureDate, isDevelopmentFixture: true },
    create: {
      url: "https://fixtures.invalid/gsoc-catalog-development",
      publisher: "GSoC Contributor Copilot development fixture",
      sourceType: SourceType.CURATED_FIXTURE,
      retrievedAt: fixtureDate,
      contentHash: "gsoc-catalog-foundation-fixture-v1",
      reliabilityTier: 0,
      isDevelopmentFixture: true,
    },
  });
  await prisma.factAssertion.deleteMany({ where: { sourceId: source.id } });

  const program = await prisma.program.upsert({
    where: { slug: "gsoc" },
    update: { name: "Google Summer of Code", websiteUrl: "https://summerofcode.withgoogle.com/" },
    create: { slug: "gsoc", name: "Google Summer of Code", websiteUrl: "https://summerofcode.withgoogle.com/" },
  });

  const cycle = await prisma.programCycle.upsert({
    where: { programId_year: { programId: program.id, year: 2026 } },
    update: { status: "ACTIVE", officialUrl: "https://summerofcode.withgoogle.com/programs/2026" },
    create: {
      programId: program.id,
      year: 2026,
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
      endsAt: new Date("2026-12-31T23:59:59.000Z"),
      status: "ACTIVE",
      officialUrl: "https://summerofcode.withgoogle.com/programs/2026",
    },
  });

  for (const [organizationIndex, [slug, name, githubOrgLogin]] of organizations.entries()) {
    const organization = await prisma.organization.upsert({
      where: { slug },
      update: { name, githubOrgLogin },
      create: {
        slug,
        name,
        githubOrgLogin,
        description: `${name} development fixture; not authoritative current GSoC data.`,
        websiteUrl: `https://${githubOrgLogin}.example.invalid`,
      },
    });
    const participation = await prisma.organizationParticipation.upsert({
      where: { organizationId_programCycleId: { organizationId: organization.id, programCycleId: cycle.id } },
      update: { status: "ACTIVE", sourceStatus: SourceStatus.VERIFIED },
      create: {
        organizationId: organization.id,
        programCycleId: cycle.id,
        status: "ACTIVE",
        officialListingUrl: "https://fixtures.invalid/gsoc-catalog-development",
        sourceStatus: SourceStatus.VERIFIED,
      },
    });

    await prisma.factAssertion.create({
      data: {
        sourceId: source.id,
        entityType: "OrganizationParticipation",
        entityId: participation.id,
        field: "sourceStatus",
        value: SourceStatus.VERIFIED,
        observedAt: fixtureDate,
        extractionMethod: "development-fixture",
        confidence: 1,
        verificationState: SourceStatus.VERIFIED,
      },
    });

    const repositoryNames = [`${githubOrgLogin}-core`, `${githubOrgLogin}-docs`];
    for (const [repositoryIndex, repositoryName] of repositoryNames.entries()) {
      const repository = await prisma.repository.upsert({
        where: {
          ownerLoginNormalized_nameNormalized: {
            ownerLoginNormalized: githubOrgLogin,
            nameNormalized: repositoryName,
          },
        },
        update: { ownerLogin: githubOrgLogin, name: repositoryName, archived: false },
        create: {
          githubRepositoryId: BigInt(100000 + organizationIndex * 10 + repositoryIndex),
          ownerLogin: githubOrgLogin,
          name: repositoryName,
          ownerLoginNormalized: githubOrgLogin.toLowerCase(),
          nameNormalized: repositoryName.toLowerCase(),
          url: `https://github.com/${githubOrgLogin}/${repositoryName}`,
          defaultBranch: "main",
          languageMetrics: { TypeScript: 0.7, Python: 0.3 },
        },
      });
      await prisma.organizationRepository.upsert({
        where: { organizationId_repositoryId: { organizationId: organization.id, repositoryId: repository.id } },
        update: { role: repositoryIndex === 0 ? RepositoryRole.PRIMARY : RepositoryRole.RELATED, sourceId: source.id },
        create: {
          organizationId: organization.id,
          repositoryId: repository.id,
          role: repositoryIndex === 0 ? RepositoryRole.PRIMARY : RepositoryRole.RELATED,
          sourceId: source.id,
        },
      });

      const normalizedTitle = `${name} starter project ${repositoryIndex + 1}`.toLowerCase();
      const project = await prisma.project.upsert({
        where: { participationId_normalizedTitle: { participationId: participation.id, normalizedTitle } },
        update: { title: `${name} Starter Project ${repositoryIndex + 1}`, sourceStatus: SourceStatus.VERIFIED },
        create: {
          participationId: participation.id,
          title: `${name} Starter Project ${repositoryIndex + 1}`,
          normalizedTitle,
          description: "Development fixture project for catalog API tests.",
          size: repositoryIndex === 0 ? "medium" : "small",
          proposalUrl: `https://fixtures.invalid/projects/${slug}/${repositoryIndex + 1}`,
          status: ProjectStatus.OPEN,
          sourceStatus: SourceStatus.VERIFIED,
        },
      });
      await prisma.projectRepository.upsert({
        where: { projectId_repositoryId: { projectId: project.id, repositoryId: repository.id } },
        update: { role: RepositoryRole.PRIMARY, sourceId: source.id },
        create: { projectId: project.id, repositoryId: repository.id, role: RepositoryRole.PRIMARY, sourceId: source.id },
      });
    }
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });