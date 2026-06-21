/// <reference types="vite/client" />

// Single source of truth for where game image assets are loaded from.
//
// Normally images live in the client's public/ folder and are served from the
// same origin as the page, so the base is just Vite's configured `base` ("./").
//
// The full image set is ~120 MB, which is too large to bundle into the itch.io
// HTML zip. For that build the art folders are hosted on our server instead:
// pass `VITE_ASSET_BASE_URL=https://…/` at build time and every image URL is
// rewritten to point there (the build script also drops the art folders from
// the zip). See tools/build-itchio.mjs.

const RAW_BASE =
  import.meta.env.VITE_ASSET_BASE_URL?.trim() || import.meta.env.BASE_URL;

/** Asset base, guaranteed to end in exactly one trailing slash. */
export const ASSET_BASE_URL = RAW_BASE.endsWith("/") ? RAW_BASE : `${RAW_BASE}/`;

/**
 * Resolve a public-relative asset path to a full URL.
 * e.g. assetUrl("units/warrior.png") -> "<base>units/warrior.png"
 */
export function assetUrl(path: string): string {
  return `${ASSET_BASE_URL}${path.replace(/^\/+/, "")}`;
}
