// All calls to Spotify's internal GraphQL API live here. If a Spotify update
// breaks the app, this is the file to fix.

const LABELS_CACHE_KEY = "labels:albums";
const PAGE_SIZE = 50;
// Spotify stops returning search results past this offset.
const SEARCH_CAP = 1000;
const LOOKUP_CONCURRENCY = 4;

const SEARCH_VARS = {
	numberOfTopResults: 5,
	includeAudiobooks: false,
	includePreReleases: false,
	includeLocalConcertsField: false,
	includeArtistHasConcertsField: false,
};

// Spotify only registers searchAlbums after its Search page has loaded, so keep
// the last definition seen. The hardcoded hash is from Spotify 1.2.x, Oct 2026.
const SEARCH_DEF_KEY = "labels:searchAlbumsDef";
const SEARCH_DEF_FALLBACK = {
	name: "searchAlbums",
	operation: "query",
	sha256Hash: "202cb3305e31e5a0767ba7925f28bd728cf8f8b0217e6da43909056071cd70e9",
	value: null,
};

function searchAlbumsDefinition() {
	const live = Spicetify.GraphQL.Definitions.searchAlbums;
	if (live) {
		Spicetify.LocalStorage.set(SEARCH_DEF_KEY, JSON.stringify(live));
		return live;
	}
	try {
		return JSON.parse(Spicetify.LocalStorage.get(SEARCH_DEF_KEY)) || SEARCH_DEF_FALLBACK;
	} catch {
		return SEARCH_DEF_FALLBACK;
	}
}

function normalizeLabel(name) {
	return (name || "").trim().toLowerCase();
}

// uri -> [label, isoDate]. Album labels don't change, so this never expires.
let albumCache;
function loadAlbumCache() {
	if (albumCache) return albumCache;
	try {
		albumCache = JSON.parse(Spicetify.LocalStorage.get(LABELS_CACHE_KEY)) || {};
	} catch {
		albumCache = {};
	}
	return albumCache;
}
let saveTimer;
function saveAlbumCache() {
	clearTimeout(saveTimer);
	saveTimer = setTimeout(() => Spicetify.LocalStorage.set(LABELS_CACHE_KEY, JSON.stringify(albumCache)), 1000);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Spotify returns 429 when we ask too fast, and that also slows the rest of the
// client, so back off and retry.
async function gql(definition, variables) {
	for (let attempt = 0; ; attempt++) {
		try {
			return await Spicetify.GraphQL.Request(definition, variables);
		} catch (e) {
			if (e?.status !== 429 || attempt >= 5) throw e;
			await sleep(2000 * 2 ** attempt);
		}
	}
}

async function getAlbumInfo(uri) {
	const cache = loadAlbumCache();
	if (cache[uri]) return { label: cache[uri][0], date: cache[uri][1] };
	const res = await gql(Spicetify.GraphQL.Definitions.getAlbum, { uri, locale: "", offset: 0, limit: 1 });
	const album = res?.data?.albumUnion;
	if (!album) return null;
	const info = { label: album.label || "", date: album.date?.isoString || "" };
	cache[uri] = [info.label, info.date];
	saveAlbumCache();
	return info;
}

function toAlbum(item) {
	const d = item?.data;
	if (!d?.uri) return null;
	const sources = d.coverArt?.sources || [];
	return {
		uri: d.uri,
		name: d.name,
		type: d.type,
		year: d.date?.year,
		artists: (d.artists?.items || []).map((a) => ({ name: a.profile?.name, uri: a.uri })),
		image: (sources.find((s) => s.width === 300) || sources[0])?.url,
	};
}

async function mapLimit(items, limit, fn) {
	let i = 0;
	await Promise.all(Array.from({ length: limit }, async () => {
		while (i < items.length) await fn(items[i++]);
	}));
}

// Finds every album whose label matches `label` (case-insensitive). Search
// matches labels loosely ("R&S Records" also finds "Sub Pop Records"), so each
// candidate is checked with getAlbum. Search ranks real matches first, so a
// query stops at the first page with no matches.
// onProgress gets { matches, checked, otherLabels, done, error }.
// Pass fromYear to only look at recent years (used by the feed).
async function findLabelAlbums(label, { onProgress = () => {}, isCancelled = () => false, fromYear } = {}) {
	const want = normalizeLabel(label);
	const term = `label:"${label.replace(/"/g, "")}"`;
	const seen = new Set();
	const matched = new Set();
	const matches = [];
	const otherLabels = {};
	let checked = 0;
	const report = (extra) => onProgress({ matches: [...matches], checked, otherLabels: { ...otherLabels }, done: false, ...extra });

	// Returns true if the query was still finding matches when it hit the cap.
	const scan = async (searchTerm) => {
		for (let offset = 0; offset < SEARCH_CAP; offset += PAGE_SIZE) {
			if (isCancelled()) return false;
			const res = await gql(searchAlbumsDefinition(), { ...SEARCH_VARS, searchTerm, offset, limit: PAGE_SIZE });
			const albums = (res?.data?.searchV2?.albumsV2?.items || []).map(toAlbum).filter(Boolean);
			const fresh = albums.filter((a) => !seen.has(a.uri));
			fresh.forEach((a) => seen.add(a.uri));
			await mapLimit(fresh, LOOKUP_CONCURRENCY, async (album) => {
				if (isCancelled()) return;
				const info = await getAlbumInfo(album.uri).catch(() => null);
				checked++;
				if (!info) return;
				if (normalizeLabel(info.label) === want) {
					matched.add(album.uri);
					matches.push({ ...album, label: info.label, date: info.date });
				} else if (info.label) {
					otherLabels[info.label] = (otherLabels[info.label] || 0) + 1;
				}
			});
			report();
			if (albums.length < PAGE_SIZE || !albums.some((a) => matched.has(a.uri))) return false;
		}
		return true;
	};

	const thisYear = new Date().getFullYear();
	let error;
	try {
		if (fromYear) {
			for (let y = thisYear; y >= fromYear; y--) await scan(`${term} year:${y}`);
		} else if (await scan(term)) {
			// More than one query can return. Split by decade, then by year.
			for (let decade = Math.floor(thisYear / 10) * 10; decade >= 1900; decade -= 10) {
				if (!(await scan(`${term} year:${decade}-${decade + 9}`))) continue;
				for (let y = Math.min(decade + 9, thisYear); y >= decade; y--) await scan(`${term} year:${y}`);
			}
		}
	} catch (e) {
		console.error("labels: search failed", e);
		error =
			e?.name === "GraphQLFallbackUnavailableError"
				? "Spotify's search query has changed. Open Spotify's Search page once, then come back here."
				: e?.status === 429
				? "Spotify is rate limiting requests. Try again in a few minutes."
				: `Search failed: ${e?.message || e}`;
	}
	report({ done: true, error });
	return matches;
}

function sortNewestFirst(albums) {
	return albums.sort((a, b) => (b.date || String(b.year)).localeCompare(a.date || String(a.year)));
}
