# Spotify labels

A Spicetify custom app that adds record label browsing to the Spotify desktop app.

- A Labels page in the sidebar. Search for a label to see its releases, newest first. You can filter to albums or to singles and EPs.
- On album pages, the label name appears next to the release year. Click it to open that label.
- Right-click an album and choose "Browse label".
- Follow labels to get a feed of their releases from the last 90 days on the Labels home page.

## Install

```
brew install spicetify-cli
spicetify backup apply
make install
```

Spotify updates undo Spicetify. After one, run `spicetify backup apply`, then `make install`.

`make uninstall` removes the app. `spicetify restore` puts Spotify back to stock.

## How it works

Spotify's internal search supports `label:"Name"`, but it matches loosely. A search for "Warp Records" also returns "Warpaint Records". So the app checks each result's real label with an album lookup. Spotify ranks exact matches first, so a query stops at the first page of 50 with no matches. One query returns at most 1,000 results, so big labels get split into decade and then year queries.

Album labels are cached in localStorage. The first visit to a big label takes a couple of minutes (Warp is about 1,200 releases). Later visits only rerun the searches.

All internal API calls are in `src/api.js`. When Spotify changes something, that's the file to fix.

## Limits

- Labels with "&" or one-letter words in the name (R&S Records) don't search well. Spotify's label index seems to drop those characters, so results are sparse.
- Too many requests get a 429 from Spotify, which also slows the rest of the app for a few minutes. The app backs off and retries.
- The `searchAlbums` query only gets registered after Spotify's Search page opens. The app keeps the last copy it saw, plus a hardcoded fallback. If Spotify changes the query, open Search once and try again.
- Modifying the client is against Spotify's terms of service.
