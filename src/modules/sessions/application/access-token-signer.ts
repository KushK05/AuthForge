export type AccessTokenClaims = Readonly<{
  issuer: string;
  audience: string;
  subject: string;
  sessionId: string;
  projectId: string;
  tokenVersion: number;
  roles: readonly string[];
  scope: readonly string[];
  issuedAt: Date;
}>;

export interface AccessTokenSigner {
  issue(claims: AccessTokenClaims): Promise<Readonly<{ accessToken: string; expiresIn: number }>>;
}
