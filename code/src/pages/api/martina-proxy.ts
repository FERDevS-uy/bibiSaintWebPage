export async function GET({ request }: { request: Request }) {
  try {
    const reqUrl = new URL(request.url, 'http://localhost');
    const productId = reqUrl.searchParams.get('productId') || '';
    const code = reqUrl.searchParams.get('code') || '';
    const countryId = reqUrl.searchParams.get('countryId') || '598';

    if (!productId) {
      return new Response(JSON.stringify({ message: 'productId required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const endpointBase = 'https://pol21.martinaditrento.com/mdt-services/resources/store/product';
    const origin = 'https://tienda.martinaditrento.com';
    const referer = 'https://tienda.martinaditrento.com/';
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

    const tryRequest = async (codeToTry: string) => {
      const target = `${endpointBase}?productId=${encodeURIComponent(productId)}&code=${encodeURIComponent(codeToTry)}&countryId=${encodeURIComponent(countryId)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const resp = await fetch(target, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'es-ar',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
            Origin: origin,
            Referer: referer,
            'User-Agent': userAgent,
            'Sec-Fetch-Site': 'same-site',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Dest': 'empty',
          },
        });

        const text = await resp.text();
        let parsed = null;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          parsed = null;
        }

        return { ok: resp.ok, status: resp.status, text, json: parsed };
      } finally {
        clearTimeout(timeout);
      }
    };

    const attempts: any[] = [];

    // first try with provided code (if any)
    if (code) {
      const r = await tryRequest(code);
      attempts.push({ code, result: r });
      if (r.ok && Array.isArray(r.json?.data) && r.json.data.length > 0) {
        return new Response(r.text, { status: 200, headers: { 'content-type': 'application/json' } });
      }
    }

    // fallback to PUBLIC_MARTINA_CODE env
    const fallback = process.env.PUBLIC_MARTINA_CODE || '202605';
    if (fallback && fallback !== code) {
      const r2 = await tryRequest(fallback);
      attempts.push({ code: fallback, result: r2 });
      if (r2.ok && Array.isArray(r2.json?.data) && r2.json.data.length > 0) {
        return new Response(r2.text, { status: 200, headers: { 'content-type': 'application/json' } });
      }
    }

    // nothing returned useful
    return new Response(JSON.stringify({ success: false, attempts }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err: any) {
    console.error('martina-proxy error', err?.message || err);
    return new Response(JSON.stringify({ message: 'internal error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
