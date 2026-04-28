import CSInterface, { CSEvent } from "../cep/csinterface";
import Vulcan, { VulcanMessage } from "../cep/vulcan";
import { ns } from "../../../shared/shared";
import { fs } from "../cep/node";

export const csi = new CSInterface();
export const vulcan = new Vulcan();

// jsx utils

/**
 * @function EvalES
 * Evaluates a string in ExtendScript scoped to the project's namespace
 * Optionally, pass true to the isGlobal param to avoid scoping
 *
 * @param script    The script as a string to be evaluated
 * @param isGlobal  Optional. Defaults to false,
 *
 * @return String Result.
 */

export const evalES = (script: string, isGlobal = false): Promise<string> => {
  return new Promise(function (resolve, reject) {
    const pre = isGlobal
      ? ""
      : `var host = typeof $ !== 'undefined' ? $ : window; host["${ns}"].`;
    const fullString = pre + script;
    csi.evalScript(
      "try{" + fullString + "}catch(e){alert(e);}",
      (res: string) => {
        resolve(res);
      }
    );
  });
};

import type { Scripts } from "@esTypes/index";
import type { EventTS } from "../../../shared/universals";
import { initializeCEP } from "./init-cep";

type ArgTypes<F extends Function> = F extends (...args: infer A) => any
  ? A
  : never;
type ReturnType<F extends Function> = F extends (...args: infer A) => infer B
  ? B
  : never;

/**
 * @description End-to-end type-safe ExtendScript evaluation with error handling
 * Call ExtendScript functions from CEP with type-safe parameters and return types.
 * Any ExtendScript errors are captured and logged to the CEP console for tracing
 *
 * @param functionName The name of the function to be evaluated.
 * @param args the list of arguments taken by the function.
 *
 * @return Promise resolving to function native return type.
 *
 * @example
 * // CEP
 * evalTS("myFunc", 60, 'test').then((res) => {
 *    console.log(res.word);
 * });
 *
 * // ExtendScript
 * export const myFunc = (num: number, word: string) => {
 *    return { num, word };
 * }
 *
 */

export const evalTS = <
  Key extends string & keyof Scripts,
  Func extends Function & Scripts[Key]
>(
  functionName: Key,
  ...args: ArgTypes<Func>
): Promise<ReturnType<Func>> => {
  return new Promise(function (resolve, reject) {
    const formattedArgs = args
      .map((arg) => {
        console.log(JSON.stringify(arg));
        return `${JSON.stringify(arg)}`;
      })
      .join(",");
    csi.evalScript(
      `try{
          var host = typeof $ !== 'undefined' ? $ : window;
          var res = host["${ns}"].${functionName}(${formattedArgs});
          JSON.stringify(res);
        }catch(e){
          e.fileName = new File(e.fileName).fsName;
          JSON.stringify(e);
        }`,
      (res: string) => {
        try {
          //@ts-ignore
          if (res === "undefined") return resolve();
          const parsed = JSON.parse(res);
          if (
            typeof parsed.name === "string" &&
            (<string>parsed.name).toLowerCase().includes("error")
          ) {
            console.error(parsed.message);
            reject(parsed);
          } else {
            resolve(parsed);
          }
        } catch (error) {
          reject(res);
        }
      }
    );
  });
};

export const evalFile = (file: string) => {
  return evalES(
    "typeof $ !== 'undefined' ? $.evalFile(\"" +
      file +
      '") : fl.runScript(FLfile.platformPathToURI("' +
      file +
      '"));',
    true
  );
};

/**
 * @function listenTS End-to-end Type-Safe ExtendScript to JavaScript Events
 * Uses the PlugPlug ExternalObject to trigger events in CEP panels
 * Function comes scoped to the panel's namespace to avoid conflicts
 * Simply declare your event name and value in the shared/universals.ts file
 * Listen for events with listenTS() in your CEP panel
 * Trigger those events with dispatchTS() ExtendScript
 * @param event The event name to listen for (defined in EventTS in shared/universals.ts)
 * @param callback The callback function to be executed when the event is triggered
 * @param isLocal Whether to scope the event to the panel's namespace. Defaults to true
 *
 * @example
 *
 * // 1. Declare Type in EventTS in shared/universals.ts
 * export type EventTS = {
 *  'myCustomEvent': {
 *   name: string;
 *   value: number;
 * }
 *  // [... other events]
 * };
 *
 * // 2. Listen in CEP
 * listenTS("myCustomEvent", (data) => {
 *   console.log("name is", data.name);
 *   console.log("value is", data.value);
 * });
 *
 * // 3. Dispatch in ExtendScript
 * dispatchTS("myCustomEvent", { name: "name", value: 20 });
 *
 */
export const listenTS = <Key extends string & keyof EventTS>(
  event: Key,
  callback: (data: EventTS[Key]) => void,
  isLocal = true
) => {
  const fullEvent = isLocal ? `${ns}.${event}` : event;
  const csi = new CSInterface();
  // console.log(`listening to ${fullEvent}`);
  const thisCallback = (e: { data: EventTS[Key] }) => {
    callback(e.data);
  };

  // remove any existing listeners
  csi.removeEventListener(fullEvent, thisCallback, null);
  // add the event listener
  csi.addEventListener(fullEvent, thisCallback);
};

/**
 * @function dispatchTS Displatches an event within or between CEP panels with Type-Safety
 * See listenTS() in the CEP panel for more info
 * @param event The event name to listen for (defined in EventTS in shared/universals.ts)
 * @param callback The callback function to be executed when the event is triggered
 * @param scope The scope of the event. Defaults to "APPLICATION"
 * @param appId The application ID. Defaults to the current application
 * @param id The extension ID. Defaults to the current extension
 * @param isLocal Whether to scope the event to the panel's namespace. Defaults to true
 */
export const dispatchTS = <Key extends string & keyof EventTS>(
  event: Key,
  data: EventTS[Key],
  scope = "APPLICATION",
  appId = csi.getApplicationID() as string,
  id = csi.getExtensionID() as string,
  isLocal = true
) => {
  const fullEvent = isLocal ? `${ns}.${event}` : event;
  // console.log(`dispatching ${fullEvent}`);
  const csEvent = new CSEvent(fullEvent, scope, appId, id);
  csEvent.data = data;
  csi.dispatchEvent(csEvent);
};

// js utils

export const initBolt = (log = true) => {
  if (window.cep) {
    const extRoot = csi.getSystemPath("extension");
    const jsxSrc = `${extRoot}/jsx/index.js`;
    const jsxBinSrc = `${extRoot}/jsx/index.jsxbin`;
    if (fs.existsSync(jsxSrc)) {
      if (log) console.log(jsxSrc);
      evalFile(jsxSrc);
    } else if (fs.existsSync(jsxBinSrc)) {
      if (log) console.log(jsxBinSrc);
      evalFile(jsxBinSrc);
    }
    initializeCEP();
  }
};

export const posix = (str: string) => str.replace(/\\/g, "/");

export const openLinkInBrowser = (url: string) => {
  if (window.cep) {
    csi.openURLInDefaultBrowser(url);
  } else {
    location.href = url;
  }
};

export const getAppBackgroundColor = () => {
  const { green, blue, red } = JSON.parse(
    window.__adobe_cep__.getHostEnvironment() as string
  ).appSkinInfo.panelBackgroundColor.color;
  return {
    rgb: {
      r: red,
      g: green,
      b: blue,
    },
    hex: `#${red.toString(16)}${green.toString(16)}${blue.toString(16)}`,
  };
};

export const subscribeBackgroundColor = (callback: (color: string) => void) => {
  const getColor = () => {
    const newColor = getAppBackgroundColor();
    console.log("BG Color Updated: ", { rgb: newColor.rgb });
    const { r, g, b } = newColor.rgb;
    return `rgb(${r}, ${g}, ${b})`;
  };
  // get current color
  callback(getColor());
  // listen for changes
  csi.addEventListener(
    "com.adobe.csxs.events.ThemeColorChanged",
    () => callback(getColor()),
    {}
  );
};

// vulcan

declare type IVulcanMessageObject = {
  event: string;
  callbackID?: string;
  data?: string | null;
  payload?: object;
};

export const vulcanSend = (id: string, msgObj: IVulcanMessageObject) => {
  const msg = new VulcanMessage(VulcanMessage.TYPE_PREFIX + id, null, null);
  const msgStr = JSON.stringify(msgObj);
  msg.setPayload(msgStr);
  vulcan.dispatchMessage(msg);
};

export const vulcanListen = (id: string, callback: Function) => {
  vulcan.addMessageListener(
    VulcanMessage.TYPE_PREFIX + id,
    (res: any) => {
      var msgStr = vulcan.getPayload(res);
      const msgObj = JSON.parse(msgStr);
      callback(msgObj);
    },
    null
  );
};

export const isAppRunning = (targetSpecifier: string) => {
  const { major, minor, micro } = csi.getCurrentApiVersion();
  const version = parseFloat(`${major}.${minor}`);
  if (version >= 11.2) {
    return vulcan.isAppRunningEx(targetSpecifier.toUpperCase());
  } else {
    return vulcan.isAppRunning(targetSpecifier);
  }
};

interface IOpenDialogResult {
  data: string[];
}
export const selectFolder = (
  dir: string,
  msg: string,
  callback: (res: string) => void
) => {
  const result = (
    window.cep.fs.showOpenDialogEx || window.cep.fs.showOpenDialog
  )(false, true, msg, dir) as IOpenDialogResult;
  if (result.data?.length > 0) {
    const folder = decodeURIComponent(result.data[0].replace("file://", ""));
    callback(folder);
  }
};

export const selectFile = (
  dir: string,
  msg: string,
  callback: (res: string) => void
) => {
  const result = (
    window.cep.fs.showOpenDialogEx || window.cep.fs.showOpenDialog
  )(false, false, msg, dir) as IOpenDialogResult;
  if (result.data?.length > 0) {
    const folder = decodeURIComponent(result.data[0].replace("file://", ""));
    callback(folder);
  }
};

/**
 * @function enableSpectrum fixes an issue with React Spectrum and PointerEvents on MacOS
 * Run once at the start of your app to fix this issue
 */

export const enableSpectrum = () => {
  if (window.PointerEvent) {
    //@ts-ignore
    delete window.PointerEvent;
  }
};
