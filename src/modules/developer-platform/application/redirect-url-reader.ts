export interface RedirectUrlReader {
  hasRedirectUrl(input: Readonly<{ projectId: string; url: string }>): Promise<boolean>;
}
