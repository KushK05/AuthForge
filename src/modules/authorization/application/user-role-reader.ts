export type UserAuthorizationClaims = Readonly<{
  roles: readonly string[];
  scope: readonly string[];
}>;

export interface UserRoleReader {
  findUserAuthorizationClaims(input: Readonly<{ projectId: string; userId: string }>): Promise<UserAuthorizationClaims>;
}
