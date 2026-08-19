export interface IdentityUserReader {
  findUserInProject(input: Readonly<{ projectId: string; userId: string }>): Promise<boolean>;
}
