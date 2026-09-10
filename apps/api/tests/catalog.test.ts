import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import type { CatalogReader } from "../src/modules/catalog/catalog.js";

const cycleId = "00000000-0000-0000-0000-000000000001";
const organizationId = "00000000-0000-0000-0000-000000000002";

function createReader(): CatalogReader {
  return {
    listProgramCycles: vi.fn().mockResolvedValue([{ id: cycleId, year: 2026, program: { slug: "gsoc" } }]),
    listOrganizations: vi.fn().mockResolvedValue([{ organization: { id: organizationId, slug: "alpha-tools" }, projects: [] }]),
    getOrganization: vi.fn().mockResolvedValue({ id: organizationId, slug: "alpha-tools", participations: [], repositories: [] }),
  };
}

describe("catalog read path", () => {
  it("lists program cycles", async () => {
    const response = await request(createApp(createReader())).get("/api/catalog/program-cycles");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].year).toBe(2026);
  });

  it("lists organizations for a valid cycle", async () => {
    const reader = createReader();
    const response = await request(createApp(reader)).get(`/api/catalog/program-cycles/${cycleId}/organizations`);

    expect(response.status).toBe(200);
    expect(response.body.data[0].organization.slug).toBe("alpha-tools");
    expect(reader.listOrganizations).toHaveBeenCalledWith(cycleId);
  });

  it("fetches an organization with projects and repositories", async () => {
    const response = await request(createApp(createReader())).get(`/api/catalog/organizations/${organizationId}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: organizationId, participations: [], repositories: [] });
  });

  it("rejects invalid identifiers and reports missing organizations", async () => {
    const reader = createReader();
    const app = createApp(reader);

    const invalidResponse = await request(app).get("/api/catalog/organizations/not-a-uuid");
    expect(invalidResponse.status).toBe(400);
    expect(reader.getOrganization).not.toHaveBeenCalled();

    reader.getOrganization = vi.fn().mockResolvedValue(null);
    const missingResponse = await request(app).get(`/api/catalog/organizations/${organizationId}`);
    expect(missingResponse.status).toBe(404);
  });
});