type AdminEnv = { ADMIN_EMAIL?: string; ADMIN_EMAILS?: string };

export function authenticatedEmail(request: Request): string {
  return (request.headers.get("oai-authenticated-user-email") || "").trim().toLowerCase();
}

export function isSiteOwner(request: Request, env: AdminEnv): boolean {
  const email = authenticatedEmail(request);
  return Boolean(email && email === (env.ADMIN_EMAIL || "").trim().toLowerCase());
}

export function isSiteAdmin(request: Request, env: AdminEnv): boolean {
  if (isSiteOwner(request, env)) return true;
  const email = authenticatedEmail(request);
  return Boolean(email && (env.ADMIN_EMAILS || "")
    .split(/[\s,;]+/)
    .some(value => value.toLowerCase() === email));
}
