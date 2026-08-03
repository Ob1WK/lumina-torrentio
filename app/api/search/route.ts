import { NextRequest, NextResponse } from "next/server";

type TorrentioStream = {
  name?: string;
  title?: string;
  infoHash?: string;
  fileIdx?: number;
  sources?: string[];
};

function parseStream(stream: TorrentioStream, index: number) {
  const text = `${stream.name || ""} ${stream.title || ""}`;
  const title = (stream.title || "Archivo sin nombre").split("\n")[0];
  const resolution = /\b(2160p|4k)\b/i.test(text) ? "4K" : /\b1080p\b/i.test(text) ? "1080p" : /\b720p\b/i.test(text) ? "720p" : "Otra";
  const size = text.match(/💾\s*([^⚙️\n]+)/)?.[1]?.trim() || "—";
  const seeders = Number(text.match(/👤\s*(\d+)/)?.[1] || 0);
  const latino = /latino|lat\b|spanish lat/i.test(text);
  const spanish = /español|spanish|castellano|dual|multi/i.test(text);
  const english = /english|eng\b|dual|multi/i.test(text);
  const languages = [latino ? "Español latino" : spanish ? "Español" : null, english ? "English" : null].filter(Boolean);
  const codec = /hevc|x265/i.test(text) ? "HEVC" : /av1/i.test(text) ? "AV1" : /x264|h\.264/i.test(text) ? "H.264" : "Video";
  const trackers = (stream.sources || []).filter((source) => source.startsWith("tracker:")).map((source) => source.slice(8));
  const magnet = stream.infoHash ? `magnet:?xt=urn:btih:${stream.infoHash}&dn=${encodeURIComponent(title)}${trackers.map((tracker) => `&tr=${encodeURIComponent(tracker)}`).join("")}` : null;
  return { id: index, title, resolution, size, languages, codec, seeders, source: "Torrentio", featured: latino && english, magnet, fileIdx: stream.fileIdx };
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query) return NextResponse.json({ error: "Falta el título" }, { status: 400 });

  try {
    const catalogUrl = `https://v3-cinemeta.strem.io/catalog/movie/top/search=${encodeURIComponent(query)}.json`;
    const catalogResponse = await fetch(catalogUrl, { headers: { Accept: "application/json" } });
    if (!catalogResponse.ok) throw new Error("Cinemeta no respondió");
    const catalog = await catalogResponse.json() as { metas?: Array<{ id: string; name: string; releaseInfo?: string }> };
    const movie = catalog.metas?.[0];
    if (!movie) return NextResponse.json({ movie: null, streams: [] });

    const torrentResponse = await fetch(`https://torrentio.strem.fun/stream/movie/${movie.id}.json`, { headers: { Accept: "application/json" } });
    if (!torrentResponse.ok) throw new Error("Torrentio no respondió");
    const torrents = await torrentResponse.json() as { streams?: TorrentioStream[] };
    const streams = (torrents.streams || []).map(parseStream).sort((a, b) => {
      const quality = (value: string) => value === "4K" ? 3 : value === "1080p" ? 2 : value === "720p" ? 1 : 0;
      return Number(b.featured) - Number(a.featured) || quality(b.resolution) - quality(a.resolution) || b.seeders - a.seeders;
    });
    return NextResponse.json({ movie, streams });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error inesperado" }, { status: 502 });
  }
}
