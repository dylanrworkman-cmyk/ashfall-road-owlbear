# Ashfall Road — Owlbear Rodeo extension

A small, spoiler-free helper for the Ashfall Road table:

- **Road Card**: lantern oil kegs (with a low-oil warning), the Fire, Day, Larder, spares, and tonight's watch. The GM changes the numbers; everyone sees them.
- **Remember**: the Remembrance List. Players add names and strike out anyone their character forgets. Only the GM can remove a line.
- **Waystones**: four stones. Each stays hidden from players until the GM marks it found and types what they know.
- **Copy for the DM hub** (GM only): copies everything as one line to paste to Claude at the post-session wrap.

The data lives in the Owlbear room, so it's the same for everyone and survives between sessions.
This code is public, so it contains no story secrets. The GM types stone names and inscriptions in during play.

## Hosting (GitHub Pages, free)

1. Sign in at github.com and create a new **public** repository called `ashfall-road-owlbear`.
2. Click **uploading an existing file**, drag in every file from this folder (`manifest.json`, `index.html`, `app.js`, `style.css`, `icon.svg`, `README.md`), then click **Commit changes**.
3. Go to **Settings → Pages**. Under **Build and deployment**, set Source to **Deploy from a branch**, Branch to **main** and **/(root)**, then **Save**.
4. After a minute, your manifest is at `https://YOUR-USERNAME.github.io/ashfall-road-owlbear/manifest.json`.

## Installing in Owlbear Rodeo

1. In Owlbear, open your **Profile → Extensions → Add Custom Extension**.
2. Paste the manifest URL from step 4 above and click **Add**.
3. In the Ashfall Road room, open the **Extensions** menu and switch **Ashfall Road** on. A lantern icon appears in the top toolbar for everyone in the room.

## Updating

Edit or re-upload the files on GitHub. Owlbear picks up the change the next time the room loads.
