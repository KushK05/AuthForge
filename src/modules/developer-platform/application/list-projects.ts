import type { ProjectSummary } from "./create-project.js";

export type ProjectPage = Readonly<{
  data: readonly ProjectSummary[];
  nextCursor: string | undefined;
}>;

export interface ProjectListReader {
  listProjects(input: Readonly<{
    authenticatedProjectId: string;
    cursor: string | undefined;
    limit: number;
  }>): Promise<ProjectPage>;
}

export const listProjects = (
  reader: ProjectListReader,
  input: Readonly<{ authenticatedProjectId: string; cursor: string | undefined; limit: number }>
): Promise<ProjectPage> => reader.listProjects(input);
