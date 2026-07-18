# Rise of Civilizations — project instructions

## No bare emojis — all imagery is generated art

The game must **never ship a raw/bare emoji**. Every pictographic glyph the player
sees is rendered as a generated PNG icon, never as an OS emoji font glyph.

The pipeline:

1. **Register the glyph** in `EMOJI_ICON` in [`packages/client/src/icons.ts`](packages/client/src/icons.ts).
   The map is `emoji → ic_<id>`. Store the **base** glyph (no U+FE0F variation
   selector — lookups strip it). Several glyphs may share one `ic_` id when they
   mean the same thing (e.g. `🐎` and `🏇` both map to `ic_horse`).
2. **Add a generation def** with the **same `ic_` id** to `EMOJI_ICON_DEFS` in
   [`tools/art-generator/config.ts`](tools/art-generator/config.ts). The two lists
   must stay 1:1 — every registry id needs a def and vice versa. Hollow-outline
   glyphs (no legitimate interior white) also go in `EMOJI_SOLID_GLYPHS`.
3. **Generate the PNG** (paid Gemini step) and copy the result into
   `public/icons/<id>.png`. The client loads `<asset base>/icons/<id>.png`.

Once registered, DOM text is swapped by the `iconify` innerHTML hook and canvas
text by `drawGlyph`. Anything **not** registered falls back to the raw emoji font
— which is exactly what we forbid, so registration + generation is mandatory
before using any new glyph in `glyph:` fields, unit names, UI strings, or copy.

Rule of thumb: if you type an emoji anywhere in game-facing content, it MUST have
an entry in `EMOJI_ICON` and a generated icon behind it. No exceptions.

## Related copy rules

- No long dashes anywhere in player-facing text: never use an em dash (`—`) or
  en dash (`–`) in game copy, tutorial dialog, UI strings, or the in-game wiki
  (`packages/client/src/wiki.ts`). Rewrite with a comma, period, or colon. In
  table/placeholder cells use a word like `None` rather than a dash. Regular
  hyphens (`-`) in compound words are fine.
