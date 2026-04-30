export function jsonError(status: number, code: string, hint?: string): Response {
  const body: { error: string; hint?: string } = { error: code };
  if (hint !== undefined) body.hint = hint;
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
