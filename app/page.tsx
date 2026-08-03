"use client";

import { useMemo, useState } from "react";

type Result = {
  id: number | string;
  title: string;
  year: number;
  resolution: string;
  size: string;
  languages: string[];
  codec: string;
  seeders: number;
  source: string;
  featured?: boolean;
  magnet?: string | null;
};

const catalog: Result[] = [
  { id: 1, title: "Night of the Living Dead", year: 1968, resolution: "4K", size: "11.8 GB", languages: ["Español latino", "English"], codec: "HEVC", seeders: 284, source: "Internet Archive", featured: true },
  { id: 2, title: "Night of the Living Dead", year: 1968, resolution: "1080p", size: "3.4 GB", languages: ["Español latino", "English"], codec: "H.264", seeders: 492, source: "Internet Archive", featured: true },
  { id: 3, title: "His Girl Friday", year: 1940, resolution: "1080p", size: "2.8 GB", languages: ["English"], codec: "H.264", seeders: 138, source: "Internet Archive" },
  { id: 4, title: "The General", year: 1926, resolution: "4K", size: "8.1 GB", languages: ["Muda", "Subtítulos ES"], codec: "HEVC", seeders: 94, source: "Public Domain Torrents" },
  { id: 5, title: "Charade", year: 1963, resolution: "1080p", size: "4.2 GB", languages: ["Español latino", "English"], codec: "H.264", seeders: 221, source: "Internet Archive", featured: true },
];

const suggestions = ["Night of the Living Dead", "Charade", "The General"];

type TorrentioStream = { name?: string; title?: string; infoHash?: string; fileIdx?: number; sources?: string[] };

function parseTorrentioStream(stream: TorrentioStream, index: number): Result {
  const text = `${stream.name || ""} ${stream.title || ""}`;
  const title = (stream.title || "Archivo sin nombre").split("\n")[0];
  const resolution = /\b(2160p|4k)\b/i.test(text) ? "4K" : /\b1080p\b/i.test(text) ? "1080p" : /\b720p\b/i.test(text) ? "720p" : "Otra";
  const size = text.match(/💾\s*([^⚙️\n]+)/)?.[1]?.trim() || "—";
  const seeders = Number(text.match(/👤\s*(\d+)/)?.[1] || 0);
  const latino = /latino|lat\b|spanish lat/i.test(text);
  const spanish = /español|spanish|castellano|dual|multi/i.test(text);
  const english = /english|eng\b|dual|multi/i.test(text);
  const languages = [latino ? "Español latino" : spanish ? "Español" : null, english ? "English" : null].filter(Boolean) as string[];
  const codec = /hevc|x265/i.test(text) ? "HEVC" : /av1/i.test(text) ? "AV1" : /x264|h\.264/i.test(text) ? "H.264" : "Video";
  const trackers = (stream.sources || []).filter((source) => source.startsWith("tracker:")).map((source) => source.slice(8));
  const magnet = stream.infoHash ? `magnet:?xt=urn:btih:${stream.infoHash}&dn=${encodeURIComponent(title)}${trackers.map((tracker) => `&tr=${encodeURIComponent(tracker)}`).join("")}` : null;
  return { id: index, title, resolution, size, languages, codec, seeders, source: "Torrentio", featured: latino && english, magnet };
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [quality, setQuality] = useState<"Todos" | "4K" | "1080p">("Todos");
  const [notice, setNotice] = useState<string | null>(null);
  const [liveResults, setLiveResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [movieName, setMovieName] = useState("");

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (liveResults || catalog)
      .filter((item) => !term || item.title.toLowerCase().includes(term))
      .filter((item) => quality === "Todos" || item.resolution === quality)
      .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || b.seeders - a.seeders);
  }, [query, quality, liveResults]);

  async function search(value?: string) {
    const term = value || query;
    if (value) setQuery(value);
    if (!term.trim()) return;
    setSearched(true);
    setNotice(null);
    setLoading(true);
    try {
      const catalogResponse = await fetch(`https://v3-cinemeta.strem.io/catalog/movie/top/search=${encodeURIComponent(term)}.json`);
      if (!catalogResponse.ok) throw new Error("Cinemeta no respondió");
      const catalogData = await catalogResponse.json() as { metas?: Array<{ id: string; name: string }> };
      const movie = catalogData.metas?.[0];
      if (!movie) { setLiveResults([]); setMovieName(term); return; }
      const torrentResponse = await fetch(`https://torrentio.strem.fun/stream/movie/${movie.id}.json`);
      if (!torrentResponse.ok) throw new Error(`Torrentio no respondió (${torrentResponse.status})`);
      const torrentData = await torrentResponse.json() as { streams?: TorrentioStream[] };
      const parsed = (torrentData.streams || []).map(parseTorrentioStream).sort((a, b) => {
        const score = (value: string) => value === "4K" ? 3 : value === "1080p" ? 2 : value === "720p" ? 1 : 0;
        return Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || score(b.resolution) - score(a.resolution) || b.seeders - a.seeders;
      });
      setLiveResults(parsed);
      setMovieName(movie.name);
    } catch (error) {
      setLiveResults([]);
      setNotice(error instanceof Error ? error.message : "No se pudo conectar con Torrentio");
    } finally { setLoading(false); }
  }

  return (
    <main>
      <nav className="nav">
        <a className="brand" href="#top" aria-label="Lúmina inicio"><span className="brand-mark">L</span><span>LÚMINA</span></a>
        <div className="nav-links"><a href="#catalogo">Catálogo</a><a href="#como-funciona">Cómo funciona</a></div>
        <div className="legal-pill"><span /> Fuentes legales</div>
      </nav>

      <section className="hero" id="top">
        <div className="grain" />
        <div className="eyebrow"><span>◆</span> ENCONTRÁ · ELEGÍ · REPRODUCÍ</div>
        <h1>Tu próxima película,<br /><em>sin vueltas.</em></h1>
        <p className="subhead">Buscá títulos de dominio público y encontrá la mejor versión disponible. Priorizamos audio dual, 4K y 1080p.</p>

        <form className="search" onSubmit={(e) => { e.preventDefault(); search(); }}>
          <span className="search-icon">⌕</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Escribí una película..." aria-label="Buscar una película" />
          <button type="submit">BUSCAR <span>→</span></button>
        </form>

        <div className="suggestions"><span>PROBÁ CON</span>{suggestions.map((item) => <button key={item} onClick={() => search(item)}>{item}</button>)}</div>

        <div className="proof"><div className="avatars"><i>4K</i><i>ES</i><i>EN</i></div><p><strong>Selección inteligente</strong><br />Mejor calidad primero, siempre.</p></div>
      </section>

      <section className="results-section" id="catalogo">
        <div className="section-heading">
          <div><span className="kicker">RESULTADOS DE TORRENTIO</span><h2>{loading ? "Buscando fuentes…" : searched ? `Resultados para “${movieName || query}”` : "Listos para descubrir"}</h2></div>
          <div className="filters" aria-label="Filtrar por calidad">{(["Todos", "4K", "1080p"] as const).map((item) => <button className={quality === item ? "active" : ""} onClick={() => setQuality(item)} key={item}>{item}</button>)}</div>
        </div>

        <div className="result-list">
          {!loading && (searched ? results : catalog.slice(0, 3)).map((item, index) => (
            <article className="result" key={item.id}>
              <div className="rank">{String(index + 1).padStart(2, "0")}</div>
              <div className="movie-info"><div className="title-row"><h3>{item.title}</h3><span>{item.year}</span></div><div className="tags"><b className={item.resolution === "4K" ? "gold" : ""}>{item.resolution}</b>{item.languages.map((lang) => <span key={lang}>{lang}</span>)}<span>{item.codec}</span></div></div>
              <div className="meta"><span>{item.size}</span><span className="seeds">▲ {item.seeders}</span><small>{item.source}</small></div>
              {item.magnet ? <a className="torrent-button" href={item.magnet} aria-label={`Abrir torrent de ${item.title}`}>ABRIR TORRENT <span>↗</span></a> : <button className="torrent-button" onClick={() => setNotice("Realizá una búsqueda para obtener el enlace real de Torrentio.")}>VER FUENTE <span>↗</span></button>}
            </article>
          ))}
          {!loading && searched && results.length === 0 && <div className="empty"><span>◌</span><h3>No encontramos fuentes</h3><p>Probá con otro título o revisá la escritura.</p><button onClick={() => { setQuery(""); setSearched(false); setLiveResults(null); }}>VER CATÁLOGO</button></div>}
        </div>
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice(null)}>×</button></div>}
      </section>

      <section className="how" id="como-funciona">
        <span className="kicker">SIMPLE Y TRANSPARENTE</span><h2>Una búsqueda. La mejor versión.</h2>
        <div className="steps"><div><b>01</b><h3>Buscá</h3><p>Escribí el título que querés encontrar.</p></div><div><b>02</b><h3>Compará</h3><p>Ordenamos audio dual y alta resolución primero.</p></div><div><b>03</b><h3>Abrí la fuente</h3><p>Accedé al archivo desde su colección autorizada.</p></div></div>
      </section>

      <footer><div className="brand"><span className="brand-mark">L</span><span>LÚMINA</span></div><p>Uso personal y autorizado · Resultados provistos por Torrentio.</p><span>Hecho para cinéfilos · 2026</span></footer>
    </main>
  );
}
