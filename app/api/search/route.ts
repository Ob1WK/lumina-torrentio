import { NextRequest, NextResponse } from "next/server";

type TorrentioStream = { name?: string; title?: string; infoHash?: string; fileIdx?: number; sources?: string[] };
type NovaSource = {
  real_url?: string;
  embed_url?: string;
  url?: string;
  host?: string;
  server?: string;
  provider?: string;
  quality?: string;
  language?: string;
  priority?: number;
  requires_extraction?: boolean;
  type?: string;
};
type NovaPayload = { sources?: NovaSource[] };
type CinemetaMeta = { id: string; name: string; releaseInfo?: string; year?: string; moviedb_id?: number };

const NOVA_API = "https://syntorq.com/api/";
const NOVA_DIRECT_HOSTS = new Set(["inyoutv.com", "www.inyoutv.com", "saludvdt.com", "www.saludvdt.com"]);

function parseStream(stream: TorrentioStream, index: number) {
  const text = `${stream.name || ""} ${stream.title || ""}`;
  const title = (stream.title || "Archivo sin nombre").split("\n")[0];
  const resolution = /\b(2160p|4k)\b/i.test(text) ? "4K" : /\b1080p\b/i.test(text) ? "1080p" : /\b720p\b/i.test(text) ? "720p" : "Otra";
  const size = text.match(/💾\s*([^⚙️\n]+)/)?.[1]?.trim() || "—";
  const seeders = Number(text.match(/👤\s*(\d+)/)?.[1] || 0);
  const latino = /\u{1F1F2}\u{1F1FD}|\u{1F1E6}\u{1F1F7}|\u{1F1E8}\u{1F1F4}|latino|latam|lat[ ._+-](?:eng|spa)|(?:eng|spa)[ ._+-]lat|spanish lat/iu.test(text);
  const spanish = /\u{1F1EA}\u{1F1F8}|espa(?:ñ|n)ol|spanish|castellano/iu.test(text);
  const english = /\u{1F1EC}\u{1F1E7}|\u{1F1FA}\u{1F1F8}|english|eng\b/iu.test(text);
  const languageFlags = text.match(/(?:\u{1F1F2}\u{1F1FD}|\u{1F1E6}\u{1F1F7}|\u{1F1E8}\u{1F1F4}|\u{1F1EA}\u{1F1F8}|\u{1F1EC}\u{1F1E7}|\u{1F1FA}\u{1F1F8}|\u{1F1EB}\u{1F1F7}|\u{1F1F5}\u{1F1F9}|\u{1F1F5}\u{1F1F1})/gu)?.length || 0;
  const dual = /dual(?:[ ._-]?audio)?|multi(?:[ ._-]?audio)?|multi\b/i.test(text) || languageFlags > 1;
  const languages = [latino ? "Español latino" : spanish ? "Español" : null, english ? "English" : null].filter(Boolean);
  const codec = /hevc|x265/i.test(text) ? "HEVC" : /av1/i.test(text) ? "AV1" : /x264|h\.264/i.test(text) ? "H.264" : "Video";
  const trackers = (stream.sources || []).filter((source) => source.startsWith("tracker:")).map((source) => source.slice(8));
  const magnet = stream.infoHash ? `magnet:?xt=urn:btih:${stream.infoHash}&dn=${encodeURIComponent(title)}${trackers.map((tracker) => `&tr=${encodeURIComponent(tracker)}`).join("")}` : null;
  const dualLatinoEnglish = latino && english;
  const languagePriority = dualLatinoEnglish ? 5 : latino && dual ? 4 : latino ? 3 : spanish && english ? 2 : english ? 1 : spanish ? 0 : -1;
  return { id: `torrent-${index}`, title, resolution, size, languages, codec, seeders, source: "Torrentio", featured: dualLatinoEnglish, languagePriority, magnet };
}

async function getJson<T>(input: string): Promise<T> {
  const response = await fetch(input, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; Lumina/1.0)" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`La fuente respondió ${response.status}`);
  return response.json() as Promise<T>;
}

function isLatino(value?: string) {
  const language = String(value || "").trim().toLowerCase().replace("_", "-");
  return /^(?:lat|latam|latino|latina|es-la|es-419)$/.test(language) || /\b(?:latino|latina|latam)\b/.test(language);
}

function novaMp4Results(payloads: NovaPayload[], title: string) {
  const seen = new Set<string>();
  return payloads.flatMap((payload) => payload.sources || []).flatMap((source, index) => {
    const raw = source.real_url || source.embed_url || source.url;
    if (!raw || seen.has(raw) || !isLatino(source.language)) return [];
    let url: URL;
    try { url = new URL(raw); } catch { return []; }
    const direct = source.requires_extraction === false || source.type?.toLowerCase() === "direct" || /\.mp4(?:$|[?#])/i.test(url.href);
    if (!direct || !/\.mp4(?:$|[?#])/i.test(url.href) || !NOVA_DIRECT_HOSTS.has(url.hostname.toLowerCase())) return [];
    seen.add(raw);
    const quality = source.quality || "Auto";
    const resolution = /2160|4k/i.test(quality) ? "4K" : /1080/i.test(quality) ? "1080p" : /720|hd/i.test(quality) ? "720p" : "Otra";
    const downloadUrl = `/api/nova/download?url=${encodeURIComponent(url.href)}&title=${encodeURIComponent(title)}`;
    return [{
      id: `nova-${index}-${source.priority ?? 999}`,
      title,
      resolution,
      size: "MP4 directo",
      languages: ["Español latino"],
      codec: "MP4",
      seeders: 0,
      source: `Nova · ${source.host || source.server || source.provider || url.hostname}`,
      featured: true,
      languagePriority: 5,
      downloadUrl,
    }];
  }).sort((a, b) => a.id.localeCompare(b.id));
}

async function findNovaItem(type: "movie" | "series", meta: CinemetaMeta) {
  const resource = type === "series" ? "series" : "movies";
  const data = await getJson<Array<{ id: number; tmdb_id?: number; title?: string; year?: number }>>(
    `${NOVA_API}${resource}/search?limit=50&skip=0&q=${encodeURIComponent(meta.name)}`,
  );
  return data.find((item) => String(item.tmdb_id || "") === String(meta.moviedb_id || "")) ||
    data.find((item) => item.title?.localeCompare(meta.name, undefined, { sensitivity: "base" }) === 0);
}

async function getNovaStreams(type: "movie" | "series", meta: CinemetaMeta) {
  const item = await findNovaItem(type, meta);
  if (!item?.id) return [];
  if (type === "movie") {
    const detail = await getJson<NovaPayload>(`${NOVA_API}movies/${item.id}`);
    return novaMp4Results([detail], meta.name);
  }
  const tmdbId = meta.moviedb_id;
  const year = Number.parseInt(meta.year || meta.releaseInfo || "", 10);
  const paths = [
    tmdbId ? `${NOVA_API}vod/sources/tv/${tmdbId}/1/1?title=${encodeURIComponent(meta.name)}&year=${Number.isFinite(year) ? year : ""}&imdb_id=${encodeURIComponent(meta.id)}&is_anime=false` : null,
    tmdbId ? `${NOVA_API}sources/tv/${tmdbId}/1/1?imdb_id=${encodeURIComponent(meta.id)}` : null,
    `${NOVA_API}series/${item.id}/seasons/1/episodes/1/extract-sources`,
  ].filter(Boolean) as string[];
  const responses = await Promise.allSettled(paths.map((path) => getJson<NovaPayload>(path)));
  return novaMp4Results(responses.flatMap((result) => result.status === "fulfilled" ? [result.value] : []), `${meta.name} S01E01`);
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const requestedId = request.nextUrl.searchParams.get("id")?.trim();
  const type = request.nextUrl.searchParams.get("type") === "series" ? "series" : "movie";
  if (!query && !requestedId) return NextResponse.json({ error: "Falta el título" }, { status: 400 });

  try {
    let meta: CinemetaMeta | undefined;
    if (requestedId) {
      const data = await getJson<{ meta?: CinemetaMeta }>(`https://v3-cinemeta.strem.io/meta/${type}/${encodeURIComponent(requestedId)}.json`);
      meta = data.meta;
    } else {
      const data = await getJson<{ metas?: CinemetaMeta[] }>(`https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(query || "")}.json`);
      meta = data.metas?.[0];
    }
    if (!meta) return NextResponse.json({ movie: null, streams: [] });

    const streamId = type === "series" ? `${meta.id}:1:1` : meta.id;
    const [torrentResult, novaResult] = await Promise.allSettled([
      getJson<{ streams?: TorrentioStream[] }>(`https://torrentio.strem.fun/providers=yts,eztv,rarbg,1337x,thepiratebay,kickasstorrents,torrentgalaxy,magnetdl,horriblesubs,nyaasi,tokyotosho,anidex,nekobt,cinecalidad|language=latino|qualityfilter=threed,scr,cam,unknown|limit=50/stream/${type}/${streamId}.json`),
      getNovaStreams(type, meta),
    ]);
    const torrents = torrentResult.status === "fulfilled" ? (torrentResult.value.streams || []).map(parseStream) : [];
    const nova = novaResult.status === "fulfilled" ? novaResult.value : [];
    return NextResponse.json({ movie: meta, streams: [...nova, ...torrents] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error inesperado" }, { status: 502 });
  }
}
