// Public release identity contains no operator, account or private task data.
export function GET() {
  return Response.json({ revision: process.env.JUMPSERVE_BUILD_REVISION || "local" }, { headers: { "Cache-Control": "no-store" } });
}
