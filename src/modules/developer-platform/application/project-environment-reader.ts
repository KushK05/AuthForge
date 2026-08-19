export type ProjectEnvironment = Readonly<{
  issuer: string;
  audience: string;
}>;

export interface ProjectEnvironmentReader {
  findDefaultEnvironment(projectId: string): Promise<ProjectEnvironment | undefined>;
}
