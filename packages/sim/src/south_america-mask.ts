// SouthAmerica regional land mask — baked from Natural Earth via tools/geodata-poc/bake-regional-mask.mjs.
import { createRegionalMask } from "./regional-mask";

export const SOUTH_AMERICA_LON_MIN = -82;
export const SOUTH_AMERICA_LON_MAX = -34;
export const SOUTH_AMERICA_LAT_MIN = -56;
export const SOUTH_AMERICA_LAT_MAX = 13;
export const SOUTH_AMERICA_MASK_COLS = 72;
export const SOUTH_AMERICA_MASK_ROWS = 104;

const southAmericaMask = createRegionalMask({
  lonMin: SOUTH_AMERICA_LON_MIN,
  lonMax: SOUTH_AMERICA_LON_MAX,
  latMin: SOUTH_AMERICA_LAT_MIN,
  latMax: SOUTH_AMERICA_LAT_MAX,
  maskCols: SOUTH_AMERICA_MASK_COLS,
  maskRows: SOUTH_AMERICA_MASK_ROWS,
  maskB64:
    "AAAAAAAAAAAAAMACAAAAAAAAAGAMAAAAAAAAAP4PeAAAAAAAAHz/HwAAAAAAGH//fwAAAAAAZ///fwAAAAAA4////wMAAAAAwf///wcAAAAAwP///w8AAAAAgP///x8AAAAAwP////8HAAAAgP////8fAAAAwP////8/AAAAgP////8/AAAAwP////8/AAAA4P//////AAAA8P//////AAAA+P////9/AAAA/P////+/AAAA/P////+/AwAA/v//////PQAA/P////9//wAA+P///////wIA+P////////8A/v////////8B/v////////8H/v////////8f/v////////8//P////////8/8P////////9/8P////////8/4P////////8/4P////////8fwP////////8fwP////////8PgP////////8HgP////////8DAP////////8DAP////////8AAP////////8AAP7///////8AAPz///////8BAPj///////8AAMD///////8AAID///////8AAAD///////8AAAD+/////38AAAD8/////38AAAD+/////z8AAAD8/////z8AAAD+/////x8AAAD8/////z8AAAD+/////w8AAAD+/////wEAAAD+////XwAAAAD+////DwAAAAD+////BwAAAAD+////AwAAAAD/////AwAAAAD+////AwAAAAD/////AwAAAAD/////AwAAAID/////AAAAAAD/////AAAAAID///9/AAAAAAD///9/AAAAAID///8PAAAAAAD///8PAAAAAID///8PAAAAAID///8HAAAAAMD///cDAAAAAID//x8AAAAAAMD//w8AAAAAAMD//z8AAAAAAOD//x8AAAAAAOD//x8AAAAAAPD//wcAAAAAAOD/PwAAAAAAAPD/HwAAAAAAAPD/HwAAAAAAAPD/CQAAAAAAAND/AQAAAAAAAOj/BwAAAAAAAND/AwAAAAAAAOD/AQAAAAAAAMD/AQAAAAAAAPh/AAAAAAAAAPA/AAAAAAAAAPwfAAAAAAAAAPB/AAAAAAAAAPj/AAAAAAAAAPx/AAAAAAAAAPYfAAAAAAAAAPQfAAAAAAAAAPgHAAAAAAAAAPgHAAAAAAAAANgHAA0AAAAAAPAHAAAAAAAAAHgOAAAAAAAAAKAdAAAAAAAAAAB4AAAAAAAIAAAkAAAAAAAAAAAgAAAAAAAA",
});

export const isSouthAmericaLand = southAmericaMask.isLand.bind(southAmericaMask);
export const southAmericaTileLatLon = southAmericaMask.tileLatLon.bind(southAmericaMask);
