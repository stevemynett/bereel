# BeReel

Search Spotify by record label, the way Rdio used to let you. BeReel adds a page to the Spotify desktop app. Pick a label and you get its catalog, newest first.

It's a [Spicetify](https://spicetify.app) custom app. Spicetify modifies the Spotify desktop app so it can load extra pages and scripts. It runs inside the regular Spotify app, not in a browser.

## What it does

- Adds a BeReel item to Spotify's left sidebar. Type a label name, like "Warp Records" or "Cellar Live", to see every release on it, newest first. A dropdown narrows the list to albums, or to singles and EPs.
- Shows the label name on every album page, after the release year (for example, "Aphex Twin • 1992 • R&S Records"). Click it to open that label's page.
- Adds "Browse label" to the right-click menu on albums.
- Lets you follow labels. The BeReel home page then shows releases from the labels you follow from the last 90 days.
- Hides albums that Spotify has probably mislabeled. A checkbox brings them back. See "How it works" below for the details.

## Requirements

- macOS with the Spotify desktop app. Spicetify also supports Windows and Linux, but this has only been tested on macOS.
- [Homebrew](https://brew.sh). `make install` uses it to install Spicetify.
- `make` and `rsync`, which come with macOS.

## Install

From this folder, run:

```
make install
```

This installs Spicetify with Homebrew if it's missing, and has Spicetify back up and patch Spotify if it hasn't yet. Then it copies `src/` into `~/.config/spicetify/CustomApps/labels`, turns the app on in Spicetify's config, and reapplies Spicetify. Spotify restarts during this, possibly twice.

To install only the dependencies, run `make deps`.

If BeReel doesn't appear in the sidebar, quit Spotify fully with Cmd+Q and open it again.

## Using it

- BeReel page: click BeReel in the sidebar and search for a label. Results appear as they're found. The first visit to a big label takes a minute or two (Warp is about 1,200 releases). Later visits are much faster.
- From an album: click the label name in the album header, or right-click the album and choose "Browse label".
- Follow: click Follow on a label's page. Followed labels and their recent releases show on the BeReel home page, which you get to by clicking BeReel in the sidebar.
- "Similar names" under the header lists other labels that came up in the search. Click one to open it. This helps when a label goes by more than one name, or when you typed part of a name.

## After a Spotify update

Spotify updates replace the patched files, so the app disappears. Run these two commands to get it back:

```
spicetify backup apply
make install
```

## Changing the code

Edit files in `src/`, then run `make install` again. It copies the files over and restarts Spotify.

To debug, run `spicetify enable-devtools` and then `spicetify apply`. After that, Cmd+Option+I opens Chrome DevTools inside Spotify. The app logs failures with a `labels:` prefix.

## Uninstall

`make uninstall` removes the app and leaves Spicetify in place. `spicetify restore` puts Spotify back to stock.

## How it works

Spotify's public Web API won't work for this. Since February 2026, apps in development mode don't get an album's label, and search returns at most 10 results per request. So this app uses the internal GraphQL API that the Spotify desktop app itself uses, which Spicetify exposes as `Spicetify.GraphQL`.

Finding a label's releases takes three steps:

1. Search. Spotify's search understands `label:"Warp Records"`. The match is loose, though: that search also returns "Warpaint Records", "Mental Warp Records" and so on.
2. Check each result. For every album the search returns, the app fetches the album's details and reads its `label` field. It keeps the album only if that field equals the label you asked for, ignoring capital letters.
3. Know when to stop. Spotify ranks exact matches first, so a search stops at the first page of 50 results with no real matches. One search returns at most 1,000 results, so for big labels the app reruns it one decade at a time, and then one year at a time when a decade is also too big.

Spotify's `label` field is whatever the distributor sent, and it's sometimes wrong. For example, some SmallsLIVE releases have "Cellar Live" in their label field. To catch that, the app also reads the album's ℗ line (or the © line if there's no ℗). If the ℗ line doesn't mention the label name, the album is probably mislabeled and gets hidden. Generic words like "Records" and "Music" are ignored in this comparison. Tick "Show albums with a different ℗ owner" to see hidden albums. Each one shows its ℗ owner in orange. That setting also applies to the feed.

Each album's label, release date and ℗ line get cached in Spotify's localStorage and never expire, because they don't change. After the first visit, opening a label only reruns the searches.

If you ask Spotify for too much too fast, it returns HTTP 429, and the rest of the Spotify app slows down for a few minutes too. The app looks up 4 albums at a time, waits longer after each 429 before trying again, and retries failed lookups once at the end.

### Files

- `src/api.js` handles search, album lookups, label matching, the cache and retries. Every call to Spotify's internal API is in this file, so it's the one to fix when a Spotify update breaks something.
- `src/index.js` is the BeReel page: the search box, label pages, the feed and the album cards.
- `src/follows.js` stores which labels you follow.
- `src/extension.js` runs on every page. It adds the label link to album headers and the "Browse label" menu item. It has its own small album lookup, because Spicetify loads extensions separately from the app.
- `src/style.css` holds the styles for the BeReel page.
- `src/manifest.json` is the Spicetify app manifest: the name, the sidebar icons and which files to load.

## Known limits

- Labels with "&" or one-letter words in the name, like R&S Records, barely work. Spotify's label search seems to drop those characters, so it returns mostly other labels.
- The ℗ check sometimes hides real releases, when the ℗ line names a parent company or a sister label. For example, "Reel to Real" albums get hidden on the Cellar Live page. Use the checkbox to see them.
- The search query only gets registered once Spotify's own Search page has loaded. The app saves the last copy it saw and has a built-in fallback. If a Spotify update changes the query, the BeReel page says so. Open Spotify's Search page once, then try again.
- Pre-release albums (announced but not out yet) aren't included.
- Modifying the Spotify app is against Spotify's terms of service.
