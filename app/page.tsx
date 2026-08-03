"use client";

import { useEffect, useMemo, useState } from "react";

type Result = {
  id: number | string;
  title: string;
  year?: number;
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
type MediaSuggestion = { id: string; name: string; type: "movie" | "series"; year?: string; poster?: string };

function parseTorrentioStream(stream: TorrentioStream, index: number): Result {
  const text = `${stream.name || ""} ${stream.title || ""}`;
  const title = (stream.title || "Archivo sin nombre").split("\n")[0];
  const resolution = /\b(2160p|4k)\b/i.test(text) ? "4K" : /\b1080p\b/i.test(text) ? "1080p" : /\b720p\b/i.test(text) ? "720p" : "Otra";
  const size = text.match(/💾\s*([^⚙️\n]+)/)?.[1]?.trim() || "—";
  const seeders = Number(text.match(/👤\s*(\d+)/)?.[1] || 0);
  const latino = /latino|latam|lat[ ._+-](?:eng|spa)|(?:eng|spa)[ ._+-]lat|spanish lat/i.test(text);
  const dual = /dual(?:[ ._-]?audio)?|multi(?:[ ._-]?audio)?|lat(?:ino)?[ ._+/-]+(?:eng|english)|(?:eng|english)[ ._+/-]+lat(?:ino)?/i.test(text);
  const spanish = /español|spanish|castellano|dual|multi/i.test(text);
  const english = /english|eng\b/i.test(text) || (dual && latino);
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
  const [mediaSuggestions, setMediaSuggestions] = useState<MediaSuggestion[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<MediaSuggestion | null>(null);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2 || selectedMedia?.name === term) { setMediaSuggestions([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        const getCatalog = async (type: "movie" | "series") => {
          const response = await fetch(`https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(term)}.json`, { signal: controller.signal });
          if (!response.ok) return [];
          const data = await response.json() as { metas?: Array<{ id: string; name: string; releaseInfo?: string; poster?: string }> };
          return (data.metas || []).slice(0, 5).map((item) => ({ id: item.id, name: item.name, type, year: item.releaseInfo, poster: item.poster }));
        };
        const [movies, series] = await Promise.all([getCatalog("movie"), getCatalog("series")]);
        const normalized = term.toLocaleLowerCase();
        setMediaSuggestions([...movies, ...series].sort((a, b) => {
          const rank = (name: string) => name.toLocaleLowerCase() === normalized ? 2 : name.toLocaleLowerCase().startsWith(normalized) ? 1 : 0;
          return rank(b.name) - rank(a.name);
        }).slice(0, 8));
        setShowAutocomplete(true);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setMediaSuggestions([]);
      } finally { setSuggestionsLoading(false); }
    }, 280);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, selectedMedia]);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (liveResults || catalog)
      .filter((item) => !term || item.title.toLowerCase().includes(term))
      .filter((item) => quality === "Todos" || item.resolution === quality)
      .sort((a, b) => {
        const score = (value: string) => value === "4K" ? 3 : value === "1080p" ? 2 : value === "720p" ? 1 : 0;
        return Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || score(b.resolution) - score(a.resolution) || b.seeders - a.seeders;
      });
  }, [query, quality, liveResults]);

  async function search(value?: string, chosen?: MediaSuggestion) {
    const term = value || query;
    if (value) setQuery(value);
    if (!term.trim()) return;
    const exactSelection = chosen || (selectedMedia?.name === term ? selectedMedia : mediaSuggestions[0]);
    setSearched(true);
    setShowAutocomplete(false);
    setNotice(null);
    setLoading(true);
    try {
      let movie: MediaSuggestion | undefined = exactSelection;
      if (!movie) {
        const catalogResponse = await fetch(`https://v3-cinemeta.strem.io/catalog/movie/top/search=${encodeURIComponent(term)}.json`);
        if (!catalogResponse.ok) throw new Error("Cinemeta no respondió");
        const catalogData = await catalogResponse.json() as { metas?: Array<{ id: string; name: string }> };
        movie = catalogData.metas?.[0] ? { ...catalogData.metas[0], type: "movie" } : undefined;
      }
      if (!movie) { setLiveResults([]); setMovieName(term); return; }
      const streamId = movie.type === "series" ? `${movie.id}:1:1` : movie.id;
      const torrentResponse = await fetch(`https://torrentio.strem.fun/limit=50/stream/${movie.type}/${streamId}.json`);
      if (!torrentResponse.ok) throw new Error(`Torrentio no respondió (${torrentResponse.status})`);
      const torrentData = await torrentResponse.json() as { streams?: TorrentioStream[] };
      const parsed = (torrentData.streams || []).map(parseTorrentioStream).sort((a, b) => {
        const score = (value: string) => value === "4K" ? 3 : value === "1080p" ? 2 : value === "720p" ? 1 : 0;
        // Audio dual Latino + English siempre tiene prioridad sobre la resolución.
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
          <input value={query} onFocus={() => setShowAutocomplete(true)} onBlur={() => window.setTimeout(() => setShowAutocomplete(false), 150)} onChange={(e) => { setQuery(e.target.value); setSelectedMedia(null); }} placeholder="Escribí una película o serie..." aria-label="Buscar una película o serie" autoComplete="off" />
          <button type="submit">BUSCAR <span>→</span></button>
          {showAutocomplete && query.trim().length >= 2 && <div className="autocomplete" role="listbox" aria-label="Títulos sugeridos">
            {suggestionsLoading && <div className="autocomplete-status">Buscando títulos…</div>}
            {!suggestionsLoading && mediaSuggestions.map((item) => <button type="button" className="autocomplete-item" role="option" aria-selected={selectedMedia?.id === item.id} key={`${item.type}-${item.id}`} onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(item.name); setSelectedMedia(item); setShowAutocomplete(false); search(item.name, item); }}>
              {item.poster ? <img src={item.poster} alt="" /> : <span className="poster-placeholder">{item.name.slice(0, 1)}</span>}
              <span><strong>{item.name}</strong><small>{item.type === "series" ? "Serie" : "Película"}{item.year ? ` · ${item.year}` : ""}</small></span><i>→</i>
            </button>)}
            {!suggestionsLoading && mediaSuggestions.length === 0 && <div className="autocomplete-status">No encontramos coincidencias.</div>}
          </div>}
        </form>

        <div className="suggestions"><span>PROBÁ CON</span>{suggestions.map((item) => <button key={item} onClick={() => search(item)}>{item}</button>)}</div>

        <div className="proof"><div className="avatars"><i>4K</i><i>ES</i><i>EN</i></div><p><strong>Selección inteligente</strong><br />Mejor calidad primero, siempre.</p></div>
      </section>

      <section className="results-section" id="catalogo">
        <div className="section-heading">
          <div><span className="kicker">RESULTADOS DE TORRENTIO</span><h2>{loading ? "Buscando fuentes…" : searched ? `Resultados para “${movieName || query}”` : "Listos para descubrir"}</h2>{searched && !loading && <p className="result-count">{results.length} fuentes encontradas · hasta 50 por calidad</p>}</div>
          <div className="filters" aria-label="Filtrar por calidad">{(["Todos", "4K", "1080p"] as const).map((item) => <button className={quality === item ? "active" : ""} onClick={() => setQuality(item)} key={item}>{item}</button>)}</div>
        </div>

        <div className="result-list">
          {!loading && (searched ? results : catalog.slice(0, 3)).map((item, index) => (
            <article className="result" key={item.id}>
              <div className="rank">{String(index + 1).padStart(2, "0")}</div>
              <div className="movie-info"><div className="title-row"><h3>{item.title}</h3><span>{item.year}</span></div><div className="tags">{item.featured && <b className="dual">DUAL LAT + ENG</b>}<b className={item.resolution === "4K" ? "gold" : ""}>{item.resolution}</b>{item.languages.map((lang) => <span key={lang}>{lang}</span>)}<span>{item.codec}</span></div></div>
              <div className="meta"><span>{item.size}</span><span className="seeds">▲ {item.seeders}</span><small>{item.source}</small></div>
              {item.magnet ? <a className="torrent-button" href={item.magnet} aria-label={`Abrir torrent de ${item.title}`}>ABRIR TORRENT <span>↗</span></a> : <button className="torrent-button" onClick={() => setNotice("Realizá una búsqueda para obtener el enlace real de Torrentio.")}>VER FUENTE <span>↗</span></button>}
            </article>
          ))}
          {!loading && searched && results.length === 0 && <div className="empty"><span>◌</span><h3>No encontramos fuentes</h3><p>Probá con otro título o revisá la escritura.</p><button onClick={() => { setQuery(""); setSearched(false); setLiveResults(null); }}>VER CATÁLOGO</button></div>}
        </div>
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice(null)}>×</button></div>}
      </section>

      <section className="bulk" id="descarga-serie">
        <div className="bulk-copy"><span className="kicker">DESCARGA EN LOTE</span><h2>Todos los capítulos.<br /><em>Un solo archivo.</em></h2><p>Pegá un enlace autorizado de mitorrent.mx y descargá una lista con todos los magnets de la temporada. Podés cargarla completa en tu cliente torrent.</p></div>
        <form className="bulk-form" action="/api/bulk" method="get">
          <label htmlFor="series-url">ENLACE DE LA SERIE</label>
          <textarea id="series-url" name="url" required placeholder="https://mitorrent.mx/series/..." />
          <button type="submit">DESCARGAR TODOS LOS CAPÍTULOS <span>↓</span></button>
          <small>Admite exclusivamente enlaces de mitorrent.mx. El archivo contiene un magnet por línea.</small>
        </form>
      </section>

      <section className="how" id="como-funciona">
        <span className="kicker">SIMPLE Y TRANSPARENTE</span><h2>Una búsqueda. La mejor versión.</h2>
        <div className="steps"><div><b>01</b><h3>Buscá</h3><p>Escribí el título que querés encontrar.</p></div><div><b>02</b><h3>Compará</h3><p>Ordenamos audio dual y alta resolución primero.</p></div><div><b>03</b><h3>Abrí la fuente</h3><p>Accedé al archivo desde su colección autorizada.</p></div></div>
      </section>

      <footer><div className="brand"><span className="brand-mark">L</span><span>LÚMINA</span></div><p>Uso personal y autorizado · Resultados provistos por Torrentio.</p><span>Hecho para cinéfilos · 2026</span></footer>
    </main>
  );
}
