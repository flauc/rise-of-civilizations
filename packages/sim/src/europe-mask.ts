// Europe regional land mask — baked from Natural Earth via tools/geodata-poc/bake-regional-mask.mjs.
import { createRegionalMask } from "./regional-mask";

export const EUROPE_LON_MIN = -25;
export const EUROPE_LON_MAX = 40;
export const EUROPE_LAT_MIN = 35;
export const EUROPE_LAT_MAX = 71;
export const EUROPE_MASK_COLS = 104;
export const EUROPE_MASK_ROWS = 60;

const europeMask = createRegionalMask({
  lonMin: EUROPE_LON_MIN,
  lonMax: EUROPE_LON_MAX,
  latMin: EUROPE_LAT_MIN,
  latMax: EUROPE_LAT_MAX,
  maskCols: EUROPE_MASK_COLS,
  maskRows: EUROPE_MASK_ROWS,
  maskB64:
    "HAAAAAAAAAAAkF0AAA8AAAAAAAAAgO0/AAABAAAAAAAAAFD+/w8AAAAAAAAAAADx////BwAAAAAAAACA/P///z8AAAAAAAAAgP//////AAAAAAAAAID////v/wAgAAAAAADw////H/+8/gAAAAAA8P////8A8P8DAAAAAPj/A/9/gPD/AQAAAAD8/4P//3jwPwAAAAAA///h///xAAYAAAAA4P7/8P///wAAAAAAAPj/H/z///8AAAAAAAD+/w/8////AAAAAACA//8H/P///wAAAAAAAP7/D/z///8AAAAAAAD7/w/47///AAAAAAAA//8/AMD//wAAAAAIAP7+H8D///8AAAAAAAB+/AfA////AAAAkAMACPwDgP///wAAAKAfAAD5J5j///8AAADADwDg+AP+////AAAAgA8A4PED/P///wAAACAfAGA+AP7///8AAAAoPwBAAQD8////AAAAPDwAQACc/////wAAAD/4AID///////8AAAA/+wD+////////AAAAPvyH/////////wAAAAf/w/////////8AAAAB9IH/////////AAAAAP/9/////////wAAAAAA/P////////8AAAAAAP//////////AAAAAOD//////////wAAAAD///////////8AAAAA/v//////////AAAAAPD//////////wAAAADg/////////8MAAAAAwP///////2jgAAAAAID//8///3/w8AAAAADA///H//9/4PgAAAAAwP+/D/7/PwDAAAAACOD/Bx/+/x8AgAAAAP7/HwI+8P8fAAAAAAD+/x9gPuD/DwAAAAAA/P8fQPiD/x/gAAAAAPz/BwDwg/8//AcAAAD8/wHggJ+/jP//AAAA/v8AYACTD/7//wAAAP5/EGAABh/4//8AAAD/fwIAAAIe+P//AAAA/H8AAAACMPz//wAAAP4/AADwABz8//8AAADsHwDAgAAY8P//AAAA4AD+/wEAEMA4/gAAAIAA//8BAAAAAP4AAADA4P//AQDgATD+",
});

export const isEuropeLand = europeMask.isLand.bind(europeMask);
export const europeTileLatLon = europeMask.tileLatLon.bind(europeMask);
