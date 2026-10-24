/// <reference types="react" />

/** @type {React} */
const {
	React: react,
	React: { useState, useEffect, useRef },
	Platform: { History },
} = Spicetify;

const APP_ROUTE = "/labels";
const FEED_DAYS = 90;
const TYPE_NAMES = { ALBUM: "Album", SINGLE: "Single", EP: "EP", COMPILATION: "Compilation" };
const TYPE_FILTERS = {
	all: () => true,
	albums: (a) => a.type === "ALBUM" || a.type === "COMPILATION",
	singles: (a) => a.type === "SINGLE" || a.type === "EP",
};

function render() {
	return react.createElement(LabelsApp);
}

function labelFromLocation(location) {
	return new URLSearchParams(location?.search || "").get("label") || "";
}

function openLabel(label) {
	History.push(`${APP_ROUTE}?label=${encodeURIComponent(label)}`);
}

function LabelsApp() {
	const [label, setLabel] = useState(labelFromLocation(History.location));
	useEffect(() => History.listen((location) => {
		if (location.pathname === APP_ROUTE) setLabel(labelFromLocation(location));
	}), []);

	return react.createElement(
		"div",
		{ className: "labels-app contentSpacing" },
		react.createElement(SearchBox, { initial: label }),
		label ? react.createElement(LabelPage, { label, key: label }) : react.createElement(HomePage)
	);
}

function SearchBox({ initial }) {
	const [value, setValue] = useState(initial);
	useEffect(() => setValue(initial), [initial]);
	return react.createElement(
		"form",
		{
			className: "labels-search",
			onSubmit: (e) => {
				e.preventDefault();
				if (value.trim()) openLabel(value.trim());
			},
		},
		react.createElement("input", {
			type: "search",
			placeholder: "Search for a record label",
			value,
			onChange: (e) => setValue(e.target.value),
		})
	);
}

function useCancelled() {
	const cancelled = useRef(false);
	useEffect(() => () => {
		cancelled.current = true;
	}, []);
	return () => cancelled.current;
}

function LabelPage({ label }) {
	const isCancelled = useCancelled();
	const [progress, setProgress] = useState({ matches: [], checked: 0, otherLabels: {}, done: false });
	const [following, setFollowingState] = useState(isFollowing(label));
	const [typeFilter, setTypeFilter] = useState("all");

	useEffect(() => {
		findLabelAlbums(label, { onProgress: (p) => !isCancelled() && setProgress(p), isCancelled });
	}, [label]);

	const albums = sortNewestFirst(progress.matches.filter(TYPE_FILTERS[typeFilter]));
	const others = Object.entries(progress.otherLabels)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 12);

	return react.createElement(
		"section",
		null,
		react.createElement(
			"div",
			{ className: "labels-header" },
			react.createElement("h1", null, progress.matches[0]?.label || label),
			react.createElement(
				"button",
				{
					className: `labels-button${following ? " labels-button-active" : ""}`,
					onClick: () => {
						setFollowing(label, !following);
						setFollowingState(!following);
					},
				},
				following ? "Following" : "Follow"
			),
			react.createElement(
				"select",
				{ className: "labels-select", value: typeFilter, onChange: (e) => setTypeFilter(e.target.value) },
				react.createElement("option", { value: "all" }, "All releases"),
				react.createElement("option", { value: "albums" }, "Albums"),
				react.createElement("option", { value: "singles" }, "Singles and EPs")
			)
		),
		react.createElement(
			"p",
			{ className: "labels-status" },
			progress.error ||
				(progress.done
					? `${albums.length} releases`
					: `${albums.length} releases found, checked ${progress.checked} search results...`)
		),
		others.length > 0 &&
			react.createElement(
				"div",
				{ className: "labels-chips" },
				react.createElement("span", null, "Similar names:"),
				others.map(([name]) => react.createElement("button", { key: name, className: "labels-chip", onClick: () => openLabel(name) }, name))
			),
		react.createElement(AlbumGrid, { albums })
	);
}

function HomePage() {
	const isCancelled = useCancelled();
	const follows = getFollows();
	const [feed, setFeed] = useState([]);
	const [loading, setLoading] = useState(follows.length > 0);

	useEffect(() => {
		const cutoff = new Date(Date.now() - FEED_DAYS * 86400000);
		const fromYear = cutoff.getFullYear();
		const byLabel = {};
		(async () => {
			for (const label of follows) {
				await findLabelAlbums(label, {
					fromYear,
					isCancelled,
					onProgress: ({ matches }) => {
						byLabel[label] = matches.filter((a) => a.date && new Date(a.date) >= cutoff);
						if (!isCancelled()) setFeed(sortNewestFirst(Object.values(byLabel).flat()));
					},
				});
			}
			if (!isCancelled()) setLoading(false);
		})();
	}, []);

	if (follows.length === 0) {
		return react.createElement(
			"p",
			{ className: "labels-status" },
			"Search for a label above, or click the label name on any album page. Follow labels to see their new releases here."
		);
	}

	return react.createElement(
		"section",
		null,
		react.createElement("h2", null, "Following"),
		react.createElement(
			"div",
			{ className: "labels-chips" },
			follows.map((name) => react.createElement("button", { key: name, className: "labels-chip", onClick: () => openLabel(name) }, name))
		),
		react.createElement("h2", null, `New releases (last ${FEED_DAYS} days)`),
		loading && react.createElement("p", { className: "labels-status" }, "Loading..."),
		react.createElement(AlbumGrid, { albums: feed, showLabel: true })
	);
}

function AlbumGrid({ albums, showLabel }) {
	return react.createElement(
		"div",
		{ className: "labels-grid" },
		albums.map((album) => react.createElement(AlbumCard, { key: album.uri, album, showLabel }))
	);
}

function AlbumCard({ album, showLabel }) {
	const id = album.uri.split(":").pop();
	const year = album.date ? album.date.slice(0, 4) : album.year;
	return react.createElement(
		"div",
		{ className: "labels-card", onClick: () => History.push(`/album/${id}`) },
		react.createElement("img", { src: album.image, loading: "lazy", alt: "" }),
		react.createElement("div", { className: "labels-card-title", title: album.name }, album.name),
		react.createElement(
			"div",
			{ className: "labels-card-sub" },
			album.artists.map((artist, i) =>
				react.createElement(
					react.Fragment,
					{ key: artist.uri },
					i > 0 && ", ",
					react.createElement(
						"a",
						{
							onClick: (e) => {
								e.stopPropagation();
								History.push(`/artist/${artist.uri.split(":").pop()}`);
							},
						},
						artist.name
					)
				)
			)
		),
		react.createElement(
			"div",
			{ className: "labels-card-sub" },
			[year, TYPE_NAMES[album.type]].filter(Boolean).join(" · ")
		),
		showLabel &&
			react.createElement(
				"a",
				{
					className: "labels-card-sub",
					onClick: (e) => {
						e.stopPropagation();
						openLabel(album.label);
					},
				},
				album.label
			)
	);
}
