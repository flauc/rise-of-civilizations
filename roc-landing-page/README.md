# Rise of Civilizations — Landing Page

A standalone, themed marketing landing page for the **Rise of Civilizations** game project.

## Theme

**"Forge an Empire Through the Ages"** — a dark, epic parchment-and-gold design that showcases the game's 80+ civilizations, hex-based world, and 4X gameplay loop from the Ancient Era to the Age of Exploration.

## Assets used from the game

- **Leader portraits** — all 82 generated leader images (`public/assets/leaders/`)
- **Terrain hex tiles** — plains, grassland, forest, hills, mountains, ocean, desert, coast, jungle, tundra, snow, volcano
- **Unit icons** — warrior, archer, settler, scout, swordsman, hoplite, legionary, rider, war elephant, catapult
- **Resource icons** — wheat, horses, iron, gold ore, stone, wine, silk, spices, salt, ivory
- **Building art** — city variants, village, farm, barbarian camp
- **Leader narration** — the in-game loading-scroll clips, played from the civ carousel. These are *not* copied in: at ~850 KB each they would add ~70 MB, so they stream from `game.rise-of-civilizations.com/loading/voice/<civ>.mp3`, which the game client already serves. See `civVoiceUrl()` in `src/data.ts`.

## Tech stack

- [Vite](https://vitejs.dev/) for build tooling
- TypeScript
- Vanilla CSS (no frameworks)
- Google Fonts (Cinzel + Lato)

## Commands

```bash
bun install     # install dependencies
bun run dev     # start dev server on http://localhost:5173
bun run build   # production build to dist/
bun run preview # preview the production build
```

## Project structure

```
roc-landing-page/
  public/assets/    # copied game assets
  src/
    main.ts         # page interactivity
    styles.css      # theme styles
    data.ts         # featured civilizations, eras, leaders
  index.html
  package.json
  vite.config.ts
```

## Notes

- The page is fully self-contained and can be deployed from the `dist/` folder.
- The leader marquee, featured civilization carousel, eras timeline, and hex cluster are all rendered dynamically from `src/data.ts`.
