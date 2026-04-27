import { fs, os, path } from "../cep/node";
import { csi } from "./bolt";

const readDirSafe = (dir: string) =>
  fs.existsSync(dir) ? fs.readdirSync(dir) : [];

export const getAllLuts = (): { creative: string[]; technical: string[] } => {
  const isWin = os.platform() === "win32";

  const appPath = path.dirname(csi.getSystemPath("hostApplication"));
  const appLutsDir = path.join(
    isWin ? appPath : path.dirname(appPath),
    "Lumetri",
    "LUTs"
  );

  const winLocal = path.join(
    os.homedir(),
    "AppData",
    "Roaming",
    "Adobe",
    "Common",
    "LUTs"
  );
  const winGlobal = path.join("C:", "Program Files", "Adobe", "Common", "LUTs");
  const macLocal = path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "Adobe",
    "Common",
    "LUTs"
  );
  const macGlobal = path.join(
    "Library",
    "Application Support",
    "Adobe",
    "Common",
    "LUTs"
  );

  const appCreative = path.join(appLutsDir, "Creative");
  const appTechnical = path.join(appLutsDir, "Technical");
  const localCreative = isWin
    ? path.join(winLocal, "Creative")
    : path.join(macLocal, "Creative");
  const localTechnical = isWin
    ? path.join(winLocal, "Technical")
    : path.join(macLocal, "Technical");
  const globalCreative = isWin
    ? path.join(winGlobal, "Creative")
    : path.join(macGlobal, "Creative");
  const globalTechnical = isWin
    ? path.join(winGlobal, "Technical")
    : path.join(macGlobal, "Technical");

  const appCreativeLuts = readDirSafe(appCreative);
  const appTechnicalLuts = readDirSafe(appTechnical);

  const localCreativeLuts = readDirSafe(localCreative);
  const localTechnicalLuts = readDirSafe(localTechnical);
  const globalCreativeLuts = readDirSafe(globalCreative);
  const globalTechnicalLuts = readDirSafe(globalTechnical);
  const creative = [
    ...appCreativeLuts,
    ...localCreativeLuts,
    ...globalCreativeLuts,
  ]
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map((lut) => path.basename(lut, path.extname(lut)));
  const technical = [
    ...appTechnicalLuts,
    ...localTechnicalLuts,
    ...globalTechnicalLuts,
  ]
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map((lut) => path.basename(lut, path.extname(lut)));

  return { creative, technical };
};

export const allowedImportFiles: string[] = [
  "264",
  "3g2",
  "3gp",
  "3gpp",
  "aac",
  "aaf",
  "ac3",
  "ai",
  "aif",
  "aiff",
  "ari",
  "asf",
  "asnd",
  "asx",
  "avc",
  "avi",
  "bmp",
  "bwf",
  "cin",
  "cine",
  "crm",
  "dfxp",
  "dib",
  "dif",
  "dng",
  "dpx",
  "dv",
  "eps",
  "exr",
  "f4v",
  "f4v",
  "fli",
  "gif",
  "icb",
  "ico",
  "jfif",
  "jpe",
  "jpeg",
  "jpg",
  "m15",
  "m1a",
  "m1s",
  "m1v",
  "m2a",
  "m2p",
  "m2t",
  "m2ts",
  "m2v",
  "m4a",
  "m4v",
  "m75",
  "mcc",
  "m0d",
  "mov",
  "mp2",
  "mp3",
  "mp4",
  "mpa",
  "mpe",
  "mpeg",
  "mpg",
  "mpg4",
  "mpm",
  "mpv",
  "mts",
  "mxf",
  "mxv",
  "mxr",
  "pct",
  "pict",
  "png",
  "prt",
  "ptl",
  "qt",
  "r3d",
  "rle",
  "rmf",
  "scc",
  "srt",
  "stl",
  "sxr",
  "tga",
  "tif",
  "tiff",
  "ts",
  "vda",
  "vob",
  "vst",
  "wav",
  "wma",
  "wmv",
  "psd",
];
