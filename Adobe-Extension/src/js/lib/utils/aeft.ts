import { fs, path } from "../cep/node";
import { csi } from "./bolt";

const getLatestFile = (dir: string, suffix: string): string | null => {
  const getModified = (filePath: string) =>
    fs.statSync(filePath).mtime.valueOf();
  let latestFile: string | null = null;
  fs.readdirSync(dir)
    .filter((file) => file.includes(suffix))
    .map((file) => {
      if (
        latestFile === null ||
        getModified(path.join(dir, file)) >
          getModified(path.join(dir, latestFile))
      ) {
        latestFile = file;
      }
    });
  return latestFile;
};

export const getPrefsDir = (): string => {
  const appVersion = csi.getHostEnvironment().appVersion;
  const { platform, env } = window.cep_node.process;
  const mainDir =
    platform == "darwin"
      ? `${env.HOME}/Library/Preferences`
      : env.APPDATA || "";
  const prefsDir = path.join(
    mainDir,
    "Adobe",
    "After Effects",
    parseFloat(appVersion).toFixed(1).toString()
  );
  return prefsDir;
};

export const getOutputModules = (): string[] => {
  const prefsDir = getPrefsDir();
  const prefsSuffix = "indep-output.txt";
  const outputPref = getLatestFile(prefsDir, prefsSuffix);
  if (outputPref) {
    const txt = fs.readFileSync(path.join(prefsDir, outputPref), {
      encoding: "utf-8",
    });
    const matches = txt.match(
      /\"Output Module Spec Strings Name .* = \".*.\"/g
    );
    if (matches) {
      let outputModules: string[] = [];
      matches.map((line) => {
        const str = line.split("=").pop()?.trim().replace(/"/g, "");
        if (str && !str.includes("_HIDDEN X-Factor")) {
          outputModules.push(str);
        }
      });
      return outputModules;
    }
  }
  return [];
};

export const getRenderSettingsList = (): string[] => {
  const prefsDir = getPrefsDir();
  const prefsSuffix = "indep-render.txt";
  const renderPref = getLatestFile(prefsDir, prefsSuffix);
  if (renderPref) {
    const txt = fs.readFileSync(path.join(prefsDir, renderPref), {
      encoding: "utf-8",
    });
    const lines = txt.match(/[^\r\n]+/g);
    if (lines) {
      const firstLine = lines.findIndex((line) =>
        line.includes("Render Settings List")
      );
      const lastLine = lines.findIndex((line) =>
        line.includes("Still Frame RS Index")
      );
      const settingBlock = lines
        .slice(firstLine, lastLine)
        .join("")
        .trim()
        .replace(/^.*\=/g, "")
        .replace(/\t/g, "")
        .replace(/\\/g, "")
        .replace(/\"\"/g, "");
      let renderSettings: string[] = [];
      settingBlock.match(/\".*?\"/g)?.map((str) => {
        if (str && !str.includes("_HIDDEN X-Factor")) {
          renderSettings.push(str.replace(/\"/g, ""));
        }
      });
      return renderSettings;
    }
  }
  return [];
};
