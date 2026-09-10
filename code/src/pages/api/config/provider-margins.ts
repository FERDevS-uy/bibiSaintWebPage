import { getAllProviderMarkups } from "../../../server/providers/markupSettings";

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/**
 * Public endpoint: effective markup per provider (DB override or default).
 * No auth required — values are not sensitive. Used by client live stock
 * checks to apply the same margins the server uses.
 */
export async function GET() {
  // getAllProviderMarkups never throws: network/DB failures resolve to defaults.
  const markups = await getAllProviderMarkups();
  return json(
    {
      martina: markups.martina,
      nuvex: markups.nuvex,
      kaideco: markups.kaideco,
      alondra: markups.alondra,
    },
    200,
    { "cache-control": "public, max-age=120" },
  );
}