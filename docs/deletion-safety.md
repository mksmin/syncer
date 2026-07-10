# Deletion safety

Trash plan executable only if all are true:

- remote root exists and is directory;
- every page and nested folder completed;
- no auth/network/decode/cancel error;
- provider/root matches trusted snapshot context;
- path included and within managed root;
- user enabled mirror deletions.

Defaults: max 20 files and 20% of eligible local files. Crossing either threshold marks confirmation
required. Modal must list count, percentage, first 20 paths, and choices: cancel; download/update
only; confirm trash. Automatic startup never confirms.

An empty complete index is valid only after root validation and still passes mass-delete guard. An
empty incomplete index is never valid. `.obsidian`, `.trash`, plugin data, excluded paths and
folders are outside deletion scope. v1 leaves empty directories.
