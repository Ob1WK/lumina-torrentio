import { NextRequest, NextResponse } from "next/server";

const ALLOWED_HOSTS = new Set(["mitorrent.mx", "www.mitorrent.mx"]);

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url")?.trim();
  if (!rawUrl) return NextResponse.json({ error: "Falta el enlace" }, { status: 400 });

  let source: URL;
  try { source = new URL(rawUrl); } catch { return NextResponse.json({ error: "El enlace no es válido" }, { status: 400 }); }
  if (source.protocol !== "https:" || !ALLOWED_HOSTS.has(source.hostname.toLowerCase())) {
    return NextResponse.json({ error: "Solo se admiten enlaces autorizados de mitorrent.mx" }, { status: 400 });
  }

  try {
    const response = await fetch(source, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Lumina/1.0)", Accept: "text/html" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`La fuente respondió ${response.status}`);
    const html = await response.text();
    const magnets = Array.from(html.matchAll(/href=["'](magnet:\?[^"']+)["']/gi), (match) => match[1].replaceAll("&amp;", "&"));
    const unique = [...new Set(magnets)];
    if (!unique.length) return NextResponse.json({ error: "No se encontraron capítulos en ese enlace" }, { status: 404 });

    const slug = source.pathname.split("/").filter(Boolean).pop()?.replace(/[^a-z0-9-]/gi, "-") || "serie";
    return new NextResponse(unique.join("\r\n"), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}-todos-los-capitulos.txt"`,
        "X-Chapter-Count": String(unique.length),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo leer el enlace" }, { status: 502 });
  }
}
