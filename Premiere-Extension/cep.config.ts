import { CEP_Config } from "vite-cep-plugin";
import { version } from "./package.json";

const config: CEP_Config = {
  version,
  id: "com.autosubs.premiere", 
  displayName: "AutoSubs Premiere", 
  symlink: "local",
  port: 3000,
  servePort: 5000,
  startingDebugPort: 8860,
  extensionManifestVersion: 6.0,
  requiredRuntimeVersion: 9.0,
  hosts: [
    { name: "PPRO", version: "[0.0,99.9]" }, 
  ],

  type: "Custom",
  iconDarkNormal: "./src/assets/light-icon.png",
  iconNormal: "./src/assets/dark-icon.png",
  iconDarkNormalRollOver: "./src/assets/light-icon.png",
  iconNormalRollOver: "./src/assets/dark-icon.png",
  parameters: ["--v=0", "--enable-nodejs", "--mixed-context"],
  width: 400,
  height: 300,

  panels: [
    {
      mainPath: "./main/index.html",
      name: "main",
      panelDisplayName: "", 
      type: "Custom",
      autoVisible: false,
      startOnEvents: [
        "com.adobe.csxs.events.ApplicationActivate",
        "com.adobe.csxs.events.ApplicationInitialized",
        "applicationActivate",
      ],
      width: 400,
      height: 300,
    },
  ],
  build: {
    jsxBin: "replace",
    sourceMap: false,
  },
  zxp: {
    country: "US",
    province: "CA",
    org: "Company",
    password: process.env.ZXP_PASSWORD || "password",
    tsa: [
      "http://timestamp.digicert.com/", // Windows Only
      "http://timestamp.apple.com/ts01", // MacOS Only
    ],
    allowSkipTSA: false,
    sourceMap: false,
    jsxBin: "off",
  },
  installModules: [],
  copyAssets: ["presets"],
  copyZipAssets: [],
};
export default config;
