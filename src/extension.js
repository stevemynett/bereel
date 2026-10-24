// Adds a clickable label to album page headers and a "Browse label" item to
// the album right-click menu. Runs as a separate extension, so it can't see
// the app's variables and has its own label lookup.

(function labelsExtension() {
	const { Platform, ContextMenu, URI } = Spicetify;
	if (!Platform?.History || !Spicetify.GraphQL?.Request || !Spicetify.GraphQL.Definitions?.getAlbum || !ContextMenu || !URI) {
		setTimeout(labelsExtension, 300);
		return;
	}
	const { History } = Platform;
	const LINK_CLASS = "labels-album-link";
	const HEADER_CLASS = "labels-album-label";

	const style = document.createElement("style");
	style.textContent = `.${LINK_CLASS} { cursor: pointer; } .${LINK_CLASS}:hover { text-decoration: underline; }`;
	document.head.append(style);

	// Same check as copyrightMatchesLabel in api.js: Spotify's label field is
	// sometimes wrong, and the ℗ line usually names the real owner.
	const GENERIC_LABEL_WORDS = /\b(records?|recordings?|music|label|ltd|limited|inc|llc|group)\b/g;
	const squash = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
	function copyrightMatchesLabel(copyright, label) {
		const core = squash(label.toLowerCase().replace(GENERIC_LABEL_WORDS, ""));
		if (!copyright || core.length < 2) return true;
		return squash(copyright).includes(core);
	}

	// uri -> { label, owner }. owner is the ℗ owner when it doesn't mention the label, else "".
	const labelCache = {};
	async function getLabel(uri) {
		if (!(uri in labelCache)) {
			const { GraphQL } = Spicetify;
			const res = await GraphQL.Request(GraphQL.Definitions.getAlbum, { uri, locale: "", offset: 0, limit: 1 });
			const album = res?.data?.albumUnion;
			const label = album?.label || "";
			const lines = album?.copyright?.items || [];
			const copyright = (lines.find((c) => c.type === "P") || lines[0])?.text || "";
			const owner = copyright.replace(/^\s*(\(p\)|\(c\)|℗|©)?\s*\d{4}(\s*[-–]\s*\d{4})?[\s,]*/i, "").trim();
			labelCache[uri] = { label, owner: label && owner && !copyrightMatchesLabel(copyright, label) ? owner : "" };
		}
		return labelCache[uri];
	}

	function openLabel(label) {
		History.push(`/labels?label=${encodeURIComponent(label)}`);
	}

	function currentAlbumUri() {
		const match = History.location.pathname.match(/^\/album\/([A-Za-z0-9]+)/);
		return match && `spotify:album:${match[1]}`;
	}

	function inject() {
		const uri = currentAlbumUri();
		if (!uri) return;
		const releaseDate = document.querySelector('[data-testid="album-page"] [data-testid="entity-header"] [data-testid="release-date"]');
		if (!releaseDate) return;
		const existing = releaseDate.parentElement.querySelector(`.${HEADER_CLASS}`);
		if (existing?.dataset.uri === uri) return;
		existing?.previousSibling?.remove();
		existing?.remove();

		getLabel(uri).then(({ label, owner }) => {
			if (!label || currentAlbumUri() !== uri || releaseDate.parentElement.querySelector(`.${HEADER_CLASS}`)) return;
			const separator = releaseDate.previousElementSibling?.dataset.separator ? releaseDate.previousElementSibling.cloneNode(true) : document.createElement("span");
			const header = releaseDate.cloneNode(false);
			header.removeAttribute("data-testid");
			header.classList.add(HEADER_CLASS);
			header.dataset.uri = uri;
			const link = (name) => {
				const el = document.createElement("span");
				el.className = LINK_CLASS;
				el.textContent = name;
				el.title = `Browse ${name}`;
				el.addEventListener("click", () => openLabel(name));
				return el;
			};
			if (owner) header.append(link(owner), " (listed as ", link(label), ")");
			else header.append(link(label));
			releaseDate.after(separator, header);
		});
	}

	let scheduled = false;
	new MutationObserver(() => {
		if (scheduled || !currentAlbumUri()) return;
		scheduled = true;
		requestAnimationFrame(() => {
			scheduled = false;
			inject();
		});
	}).observe(document.body, { childList: true, subtree: true });

	new ContextMenu.Item(
		"Browse label",
		async ([uri]) => {
			const { label, owner } = await getLabel(uri);
			if (label) openLabel(owner || label);
			else Spicetify.showNotification("No label listed for this album");
		},
		(uris) => uris.length === 1 && URI.isAlbum(uris[0]),
		"album"
	).register();
})();
