import { PrismaClient } from "@prisma/client";
import { Router, type Request, type Response } from "express";
import { z } from "zod";

const uuidSchema = z.string().uuid();

export type CatalogReader = {
  listProgramCycles: () => Promise<unknown[]>;
  listOrganizations: (cycleId: string) => Promise<unknown[]>;
  getOrganization: (organizationId: string) => Promise<unknown | null>;
};

export class PrismaCatalogReader implements CatalogReader {
  constructor(private readonly prisma = new PrismaClient()) {}

  listProgramCycles() {
    return this.prisma.programCycle.findMany({
      orderBy: [{ year: "desc" }, { program: { name: "asc" } }],
      select: {
        id: true,
        year: true,
        startsAt: true,
        endsAt: true,
        status: true,
        officialUrl: true,
        program: { select: { slug: true, name: true } },
      },
    });
  }

  listOrganizations(cycleId: string) {
    return this.prisma.organizationParticipation.findMany({
      where: { programCycleId: cycleId, status: "ACTIVE", sourceStatus: "VERIFIED" },
      orderBy: { organization: { name: "asc" } },
      select: {
        organization: {
          select: { id: true, slug: true, name: true, githubOrgLogin: true, websiteUrl: true },
        },
        sourceStatus: true,
        projects: { where: { status: "OPEN", sourceStatus: "VERIFIED" }, select: { id: true } },
      },
    });
  }

  getOrganization(organizationId: string) {
    return this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        websiteUrl: true,
        githubOrgLogin: true,
        repositories: {
          select: {
            role: true,
            repository: {
              select: { id: true, ownerLogin: true, name: true, url: true, defaultBranch: true, archived: true },
            },
          },
        },
        participations: {
          where: { status: "ACTIVE", sourceStatus: "VERIFIED" },
          select: {
            programCycle: { select: { id: true, year: true, program: { select: { slug: true, name: true } } } },
            projects: {
              where: { status: "OPEN", sourceStatus: "VERIFIED" },
              select: {
                id: true,
                title: true,
                description: true,
                size: true,
                proposalUrl: true,
                repositories: {
                  select: {
                    role: true,
                    repository: {
                      select: { id: true, ownerLogin: true, name: true, url: true, defaultBranch: true, archived: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  }
}

function parseUuid(value: unknown, response: Response): string | null {
  const result = uuidSchema.safeParse(value);
  if (!result.success) {
    response.status(400).json({ error: "Expected a valid UUID" });
    return null;
  }
  return result.data;
}

export function createCatalogRouter(reader: CatalogReader): Router {
  const router = Router();

  router.get("/program-cycles", async (_request, response) => {
    response.json({ data: await reader.listProgramCycles() });
  });

  router.get("/program-cycles/:cycleId/organizations", async (request: Request, response: Response) => {
    const cycleId = parseUuid(request.params.cycleId, response);
    if (!cycleId) return;
    response.json({ data: await reader.listOrganizations(cycleId) });
  });

  router.get("/organizations/:organizationId", async (request: Request, response: Response) => {
    const organizationId = parseUuid(request.params.organizationId, response);
    if (!organizationId) return;
    const organization = await reader.getOrganization(organizationId);
    if (!organization) {
      response.status(404).json({ error: "Organization not found" });
      return;
    }
    response.json({ data: organization });
  });

  return router;
}