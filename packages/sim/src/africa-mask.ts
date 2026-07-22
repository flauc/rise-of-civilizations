// Africa regional land mask — baked from Natural Earth via tools/geodata-poc/bake-regional-mask.mjs.
import { createRegionalMask } from "./regional-mask";

export const AFRICA_LON_MIN = -18;
export const AFRICA_LON_MAX = 52;
export const AFRICA_LAT_MIN = -35;
export const AFRICA_LAT_MAX = 37;
export const AFRICA_MASK_COLS = 98;
export const AFRICA_MASK_ROWS = 96;

const africaMask = createRegionalMask({
  lonMin: AFRICA_LON_MIN,
  lonMax: AFRICA_LON_MAX,
  latMin: AFRICA_LAT_MIN,
  latMax: AFRICA_LAT_MAX,
  maskCols: AFRICA_MASK_COLS,
  maskRows: AFRICA_MASK_ROWS,
  maskB64:
    "AAAH4P8AAADM8f//AwAA+P8DAAAA4P//DwDg+f8fAAADmP//PwDg//8fAAAAAP7//wCA////AAAAAPj//wPA////DwACAPD//w8A/////wd+AMD//z8A/v///x/4H4b///8A+P/////n//////8D4P///////////z8OgP////////////+xgP/////////f///HgP//////////+P8/AP//////////4///Af7/////////H///B/z/////////f/j/X/D//////////+P///H//////////w///4///////////3/4/z/////////////j///+//////////8f///7//////////9//P/P////////////wf8/////////////B///+P//////////P/j/8////////////+H/z////////////w/+P////////////z/4//z////////////i//v///////////+P/8H///////////9//AH/////////////ewD8////////////PwDw////////////fwAA/////////////4Mf/P////////////8/wP//////////////AP//////////////Afj/////////////B+D/////////////DwD8////////////PwDg/w/8////////fwAAPwbg/////////wEAAACA+P///////wMAAAAAoP///////wcAAAAAAP7//////w8AAAAAAPj//////x8AAAAAAPD//////x8AAAAAAMD//////z8AAAAAAAD//////38AAAAAAAD8//////8AAAAAAADw//////8BAAAAAACA//////8DAAAAAAAA/v////8HAAAAAAAA4P////8fAAAAAAAAgP////8/AAAAAAAAAPz/////AAAAAAAAAPD/////AQAAAAAAAID/////DwAAAAAAAAD+////PwAAAAAAAADw/////wAAAAAAAADg/////wMAAAAAAAAA/////x8AAAAAAAAA/P////8AAAAAAAAA4P////8DAAAAAAAAwP////8HAAAAAAAAgP////8/AAQAAAAAAP////9/ABwAAAAAAPz/////A3AAAAAAAPD/////D+ABAAAAAMD/////H+APAAAAAID/////P+APAAAAAAD8////P4A/AAAAAAD4////PwD/AAAAAACA/////wD4AwAAAAAA/v///wDgBwAAAAAA8P///wOAHwAAAAAAwP///w8APwAAAAAAAP7//38A/AEAAAAAAPj///8A+AMAAAAAAOD///8HwA8AAAAAAID///8PAB8AAAAAAAD8//8fAHgAAAAAAAD4//8fAAAAAAAAAADA//9/AAAAAAAAAAAA////AQAAAAAAAAAA+P//BwAAAAAAAAAAwP//DwAAAAAAAAAAAP7/HwAAAAAAAAAAAPj/PwAAAAAAAAAAAMD//wAAAAAAAAAAAAD//wAAAAAAAAAAAAD4/wEAAAAAAAAAAADw/wMAAAAAAAAAAACA/wEAAAAAAAAAAAAABAAAAAAA",
});

export const isAfricaLand = africaMask.isLand.bind(africaMask);
export const africaTileLatLon = africaMask.tileLatLon.bind(africaMask);
