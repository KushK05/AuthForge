export interface IdentityUserReader {
  findUserInProject(input: Readonly<{ projectId: string; userId: string }>): Promise<boolean>;
}

export type SignInUser = Readonly<{
  id: string;
  email: string;
  passwordHash: string;
  status: "pending_verification" | "active" | "disabled";
  tokenVersion: number;
}>;

export interface IdentityCredentialsReader {
  findUserForSignIn(input: Readonly<{ projectId: string; normalizedEmail: string }>): Promise<SignInUser | undefined>;
}
