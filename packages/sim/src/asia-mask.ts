// Asia regional land mask — baked from Natural Earth via tools/geodata-poc/bake-regional-mask.mjs.
import { createRegionalMask } from "./regional-mask";

export const ASIA_LON_MIN = 25;
export const ASIA_LON_MAX = 145;
export const ASIA_LAT_MIN = -10;
export const ASIA_LAT_MAX = 55;
export const ASIA_MASK_COLS = 120;
export const ASIA_MASK_ROWS = 72;

const asiaMask = createRegionalMask({
  lonMin: ASIA_LON_MIN,
  lonMax: ASIA_LON_MAX,
  latMin: ASIA_LAT_MIN,
  latMax: ASIA_LAT_MAX,
  maskCols: ASIA_MASK_COLS,
  maskRows: ASIA_MASK_ROWS,
  maskB64:
    "//////////////////8A//////////////////8m//////////////////8v//////////////////8///////////////////9v//////////////////8n//////////////////8n//////////////////8D//////////////////8jn/P/8P////////////8RH+N/8P////////////8AB/Ef/P///////////38QD4A//P///////////z/wAwA/+P///////////ws4BwN+6P///////////wEI86//4P///////////wAA/v//8P////////9/fgAY////8P////////8vMQAM/v//4P////////8f8AAO/P//8f/////////f4YAOsPn/////////////wIAPAPz///////////8/4OADAPj///////////8/INgBAPz///////////9/AFoAAPz/////////////AAQAAP7/////////////AAIA5///////////////AQAA//9//v//////////AAAA//9//P//////////AQAA//9//P//////////AAAA//n/8P//////////AAAA//n/Af////////8/QAAA//P/Bf7///////9/AAAA//P/YwD8//////+fAAAA/+f//wD4//////+fAQAA/+P//wPw//////+HAAAA/8///wdw///4//8AAAAA/8///wGg/x/4/xMAAAAA/4///wEA/z/w/wEAAAAA/4///wCA/w/w/xgAAAAA/x///wAA/wfg/xEAAAAA/x/+PwAA/wPg/wGAAQAA/z/8DwAA/wHg/weAAQAA/z/+BwAAfwAA/wfAAAAA///8AQAAfgAA/g+AAQAA//88AAAAfgAA/g+AAwAA//8PAAAAfAAA9A8ABAAA//8DAAAAPAAA4g9ACAAA//+HAwAAeAAAxA9AGgAA////AQAAOAAAwgEgAgAA////AwAAuAAAAgEgEAAA////AQAA2AAABgAAGAAA////AQAAgAEABAAAOAAA////AAAAwAAADAAICQAA////AAAAAAAAOAAYEAAA//9/AAAAAADAOAAeAAAA//9/AAAAAACAMwAeAAAA//8fAAAAAAAAM4APAAAA//8fAAAAAAAAbsAfgAAA//8HAAAAAAAAHvCfCAAA//8DAAAAAAAAfPAfhAAA//8BAAAAAAAAOPBPQAgA//8BAAAAAAAAcODPRRwA/38AAAAAAAAAeOHHEJAD/38AAAAAAAAA4IFGobM//z8AAAAAAAAA4ABAA+B//z8AAAAAAAAAgAFAAgD//x8AAAAAAAAAAAAABAD+/z8AAAAAAAAAAF8AAAD8/z8AAAAAAAAAAPABEAC9/z8AAAAAAAAAAAC6MwAw/z8AAAAAAAAAAABgDAAA",
});

export const isAsiaLand = asiaMask.isLand.bind(asiaMask);
export const asiaTileLatLon = asiaMask.tileLatLon.bind(asiaMask);
