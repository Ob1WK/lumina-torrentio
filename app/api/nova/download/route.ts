import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOSTS = new Set(["inyoutv.com", "www.inyoutv.com", "saludvdt.com", "www.saludvdt.com"]);

function safeFilename(value: string) {
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
  return `${normalized || "video-nova"}.mp4`;
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("url");
  if (!raw) return NextResponse.json({ error: "Falta el enlace del archivo" }, { status: 400 });

  let source: URL;
  try { source = new URL(raw); } catch { return NextResponse.json({ error: "Enlace no válido" }, { status: 400 }); }
  if (!['http:', 'https:'].includes(source.protocol) || !ALLOWED_HOSTS.has(source.hostname.toLowerCase()) || !/\.mp4(?:$|[?#])/i.test(source.href)) {
    return NextResponse.json({ error: "Proveedor MP4 no habilitado" }, { status: 403 });
  }

  try {
    const headers: Record<string, string> = { Referer: "https://syntorq.com/", "User-Agent": "Mozilla/5.0" };
    const range = request.headers.get("range");
    if (range) headers.Range = range;
    const upstream = await fetch(source, { headers, redirect: "manual", signal: AbortSignal.timeout(20_000) });
    if (!upstream.ok && upstream.status !== 206) return NextResponse.json({ error: "La fuente MP4 no respondió" }, { status: upstream.status });

    const responseHeaders = new Headers({
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${safeFilename(request.nextUrl.searchParams.get("title") || "video-nova")}"`,
      "X-Content-Type-Options": "nosniff",
    });
    for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return NextResponse.json({ error: "No se pudo descargar el MP4" }, { status: 502 });
  }
}
