// Mediterranean regional land mask — baked from Natural Earth via tools/geodata-poc/bake-regional-mask.mjs.
import { createRegionalMask } from "./regional-mask";

export const MEDITERRANEAN_LON_MIN = -10;
export const MEDITERRANEAN_LON_MAX = 42;
export const MEDITERRANEAN_LAT_MIN = 24;
export const MEDITERRANEAN_LAT_MAX = 56;
export const MEDITERRANEAN_MASK_COLS = 110;
export const MEDITERRANEAN_MASK_ROWS = 72;

const mediterraneanMask = createRegionalMask({
  lonMin: MEDITERRANEAN_LON_MIN,
  lonMax: MEDITERRANEAN_LON_MAX,
  latMin: MEDITERRANEAN_LAT_MIN,
  latMax: MEDITERRANEAN_LAT_MAX,
  maskCols: MEDITERRANEAN_MASK_COLS,
  maskRows: MEDITERRANEAN_MASK_ROWS,
  maskB64:
    "gPoBAMDrBgD8/////z8AfwAAYB8AAP//////j989AAA4BAD4///////jhx8AAE4CPv////////+AHwAA3/P/////////P/AHAPz//////////88P/wPg////////////98P/A///////////////8P/B/////////////wH/H/j///////////8PAPgP/////////////wPg//z/////////////ADwA/////////////z8AAOD/////////////DwBg/v////////////8DAPj//////////////wBw/P////////////8/AP7//////////////w8A/v//////////////AwD+//////////////8AAP7///////////+PPwCA///////////PP/gPAID//////////wEH/gMA4P////P///8f8MH/AAD4//9//P///w/w+j8AAP///x/8////AAT4DwDA///nB/7//z8AAPgDAPD/f/AD////BwAA/Pj//h8H+AP///8BAAC8////AUD+AP//PwAAAIz///8AGH4A//8HAAAA8v//PwAGP4D//wMgAYD4//8DAAF/wP//Af4DIP//HwBAAD/w///v/wOO//8HADwAf/wnh/////P/fwAABsAjP+D//////P8fCIADgIAf8P///7///wMAcABgwA/8////7///AQAAABjgBfz////z/z8AAAAAA/gD//////z/DwAAAH8A3ID///8///8AAADABwAP8P///8/5HwAAcIABgEP4////Ax4A8P8/AAAAAHB8+v8AA8D//wcAAAAAGRz+P0AA/v//AQAAAAAAwP8PcMD///8BAAD4AIDh/wP+////PwAAAAAAOPj/gP////8HAAAAAAAA/j/w/////wAAAAAAAMD/D/7/////AQAAAAAA8P/z/////38AAAAAAAD+//z//////wcAPgAAgP+/////////B+APAADw/+////////8D+D8AAPz//////////wD+/4CD////////////B///+//////////////z///////v////////////////////////////////9//////////////////7//////////////////7///////////////9//////////////////z/8////////////////D/7///////////////+D/////////////////8H///////////////9/8P///////////////z/4////////////////D/7///////////////8H/////////////////4P/",
});

export const isMediterraneanLand = mediterraneanMask.isLand.bind(mediterraneanMask);
export const mediterraneanTileLatLon = mediterraneanMask.tileLatLon.bind(mediterraneanMask);
