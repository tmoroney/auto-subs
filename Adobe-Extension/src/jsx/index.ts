// @include './lib/json2.js'

import { ns } from "../shared/shared";

import * as ppro from "./ppro/ppro";
import * as aeft from "./aeft/aeft";

// https://extendscript.docsforadobe.dev/interapplication-communication/bridgetalk-class.html?highlight=bridgetalk#appname
type ApplicationName =
  | "aftereffects"
  | "aftereffectsbeta"
  | "ame"
  | "amebeta"
  | "audition"
  | "auditionbeta"
  | "animate"
  | "animatebeta"
  | "bridge"
  | "bridgebeta"
  // | "flash"
  | "illustrator"
  | "illustratorbeta"
  | "indesign"
  | "indesignbeta"
  // | "indesignserver"
  | "photoshop"
  | "photoshopbeta"
  | "premierepro"
  | "premiereprobeta";

//@ts-ignore
const host = typeof $ !== "undefined" ? $ : window;

// A safe way to get the app name since some versions of Adobe Apps break BridgeTalk in various
// places (e.g. After Effects 24-25). In that case we have to do various checks per app to
// determine the app name.
const getAppNameSafely = (): ApplicationName | "unknown" => {
  const compare = (a: string, b: string) => {
    return a.toLowerCase().indexOf(b.toLowerCase()) > -1;
  };

  try {
    // 1. Direct check via app.name (common in AE)
    if (typeof app !== "undefined" && app.name) {
      const name = app.name.toLowerCase();
      if (compare(name, "after effects")) return "aftereffects";
      if (compare(name, "premiere")) return "premierepro";
    }

    // 2. BridgeTalk (standard but can be broken in some AE versions)
    if (typeof BridgeTalk !== "undefined" && BridgeTalk.appName) {
      return BridgeTalk.appName as ApplicationName;
    }

    // 3. Fallback: app.appName property (legacy AE)
    if (typeof app !== "undefined" && (app as any).appName) {
      const appName = (app as any).appName.toLowerCase();
      if (compare(appName, "after effects")) return "aftereffects";
    }

    // 4. Fallback: app.path property (Premiere)
    if (typeof app !== "undefined" && (app as any).path) {
      const path = (app as any).path.toLowerCase();
      if (compare(path, "premiere")) return "premierepro";
    }
  } catch (e) {
    $.writeln("[AutoSubs] getAppNameSafely error: " + e);
  }
  return "unknown";
};

const detectedApp = getAppNameSafely();
$.writeln("[AutoSubs] Detected host app: " + detectedApp);

switch (detectedApp) {
  case "aftereffects":
  case "aftereffectsbeta":
    $.writeln("[AutoSubs] Mapping AEFT functions...");
    host[ns] = aeft;
    break;
  case "premierepro":
  case "premiereprobeta":
    $.writeln("[AutoSubs] Mapping PPRO functions...");
    host[ns] = ppro;
    break;
  default:
    // CompItem is an AE-native class — its presence in the global scope is a reliable
    // indicator that we are running inside After Effects.  We intentionally avoid checking
    // app.project.activeItem because there may be no open project yet.
    try {
      // `new CompItem()` would throw in Premiere, but `CompItem` itself should be defined in AE.
      if (typeof app !== "undefined" && typeof CompItem === "function") {
        $.writeln("[AutoSubs] Fallback: CompItem class present — assuming After Effects");
        host[ns] = aeft;
      } else {
        $.writeln("[AutoSubs] Could not determine host app — functions may not be available");
      }
    } catch (e) {
      $.writeln("[AutoSubs] Fallback detection error: " + e);
    }
    break;
}

// Scripts represents the intersection of all exported functions.
// At runtime only one host module is ever active; consumers should guard with
// their own app-detection logic before calling host-specific APIs.
export type Scripts = typeof ppro & typeof aeft;
