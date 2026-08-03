import { NextRequest, NextResponse } from "next/server";

type CinemetaItem = { id: string; name: string; releaseInfo?: string; poster?: string };

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query || query.length < 2) return NextResponse.json({ suggestions: [] });

  const getCatalog = async (type: "movie" | "series") => {
    try {
      const url = `https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(query)}.json`;
      const response = await fetch(url, { headers: { Accept: "application/json" }, next: { revalidate: 300 } });
      if (!response.ok) return [];
      const data = await response.json() as { metas?: CinemetaItem[] };
      return (data.metas || []).slice(0, 6).map((item) => ({ id: item.id, name: item.name, type, year: item.releaseInfo, poster: item.poster }));
    } catch { return []; }
  };

  const [movies, series] = await Promise.all([getCatalog("movie"), getCatalog("series")]);
  const normalized = query.toLocaleLowerCase();
  const suggestions = [...movies, ...series]
    .filter((item, index, all) => all.findIndex((other) => other.id === item.id && other.type === item.type) === index)
    .sort((a, b) => {
      const rank = (name: string) => name.toLocaleLowerCase() === normalized ? 2 : name.toLocaleLowerCase().startsWith(normalized) ? 1 : 0;
      return rank(b.name) - rank(a.name);
    })
    .slice(0, 8);
  return NextResponse.json({ suggestions });
}
