const FOLLOWS_KEY = "labels:follows";

function getFollows() {
	try {
		const follows = JSON.parse(Spicetify.LocalStorage.get(FOLLOWS_KEY));
		return Array.isArray(follows) ? follows : [];
	} catch {
		return [];
	}
}

function isFollowing(label) {
	return getFollows().some((l) => normalizeLabel(l) === normalizeLabel(label));
}

function setFollowing(label, follow) {
	const rest = getFollows().filter((l) => normalizeLabel(l) !== normalizeLabel(label));
	if (follow) rest.push(label);
	rest.sort((a, b) => a.localeCompare(b));
	Spicetify.LocalStorage.set(FOLLOWS_KEY, JSON.stringify(rest));
}
