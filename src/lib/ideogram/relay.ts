const IDEOGRAM_API_ORIGIN = "https://api.ideogram.ai";

type FetchLike = typeof fetch;

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function relayIdeogramRequest(
  request: Request,
  pathname: string,
  upstreamFetch: FetchLike = fetch,
): Promise<Response> {
  const apiKey = request.headers.get("x-ideogram-api-key")?.trim();
  if (!apiKey) {
    return jsonError("Add your Ideogram API key to continue.", 401);
  }

  const contentType = request.headers.get("content-type");
  const headers: Record<string, string> = { "Api-Key": apiKey };
  if (contentType) headers["content-type"] = contentType;

  try {
    const upstream = await upstreamFetch(`${IDEOGRAM_API_ORIGIN}${pathname}`, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      redirect: "follow",
    });

    const responseHeaders = new Headers();
    const upstreamContentType = upstream.headers.get("content-type");
    if (upstreamContentType) responseHeaders.set("content-type", upstreamContentType);

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return jsonError("Ideogram could not be reached. Please try again.", 502);
  }
}
