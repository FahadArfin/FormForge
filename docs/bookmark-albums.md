# Community bookmark albums

Bookmarks now have an album browser with All bookmarks, Unfiled, and named albums. Use **Save to album** on a card or design detail to assign a design to multiple albums. Saving without an album keeps it in All bookmarks. Removing a bookmark also removes its album memberships; deleting an album keeps its bookmarks.

Albums are private browser-local data, available without signing in. They do not sync between devices or publish to Community. Public design links are fetched through the existing Community API; removed or unavailable designs retain their saved IDs.

## Storage compatibility

`communityAlbums.ts` reads the legacy `formforge-collected` array until the first successful edit. It then stores bookmarks and album memberships together in `formforge-bookmark-library-v1`, with `version: 1`. The original array is retained untouched as a migration backup. A single localStorage write makes membership changes atomic: a quota failure does not partially save a bookmark or lose an album. Malformed or unsupported versions are not overwritten.

Every operation reads current storage; storage events update other open tabs. Album IDs remain stable when renamed and are used in the private `#community?page=collections&album=…` navigation context. An album link on another device cannot reveal the album or its contents.

Names are trimmed, limited to 60 characters, and unique ignoring case. A library supports up to 100 albums and 10,000 bookmark IDs. No project documents, geometry, authentication data, or public APIs change.

## Verification

Unit coverage exercises migration, multiple membership, deletion, unfiled browsing, validation, quota failure, and preservation of malformed/future data. The Community browser suite exercises creation from Bookmarks and the save picker, multi-album assignment, detail navigation, reload, rename, deletion, removal, and desktop/phone overflow checks.
