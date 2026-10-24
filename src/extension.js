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

	const style = document.createElement("style");
	style.textContent = `.${LINK_CLASS} { cursor: pointer; } .${LINK_CLASS}:hover { text-decoration: underline; }`;
	document.head.append(style);

	const labelCache = {};
	async function getLabel(uri) {
		if (!(uri in labelCache)) {
			const { GraphQL } = Spicetify;
			const res = await GraphQL.Request(GraphQL.Definitions.getAlbum, { uri, locale: "", offset: 0, limit: 1 });
			labelCache[uri] = res?.data?.albumUnion?.label || "";
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
		const existing = releaseDate.parentElement.querySelector(`.${LINK_CLASS}`);
		if (existing?.dataset.uri === uri) return;
		existing?.previousSibling?.remove();
		existing?.remove();

		getLabel(uri).then((label) => {
			if (!label || currentAlbumUri() !== uri || releaseDate.parentElement.querySelector(`.${LINK_CLASS}`)) return;
			const separator = releaseDate.previousElementSibling?.dataset.separator ? releaseDate.previousElementSibling.cloneNode(true) : document.createElement("span");
			const link = releaseDate.cloneNode(false);
			link.removeAttribute("data-testid");
			link.classList.add(LINK_CLASS);
			link.dataset.uri = uri;
			link.textContent = label;
			link.title = `Browse ${label}`;
			link.addEventListener("click", () => openLabel(label));
			releaseDate.after(separator, link);
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
			const label = await getLabel(uri);
			if (label) openLabel(label);
			else Spicetify.showNotification("No label listed for this album");
		},
		(uris) => uris.length === 1 && URI.isAlbum(uris[0]),
		"album"
	).register();
})();
