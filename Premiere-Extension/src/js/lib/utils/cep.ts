import { os } from "../cep/node";
import { csi } from "./bolt";

/**
 * Register all possible keyboard shortcuts on Mac and Windows for you CEP Panel
 * Warning: Note that certain keys will not work per OS regardless of registration
 */

export const keyRegisterOverride = () => {
  //@ts-ignore
  const platform = navigator.platform.substring(0, 3);
  let maxKey = 0;
  if (platform === "Mac") maxKey = 126; // Mac Max Key Code
  else if (platform === "Win") maxKey = 222; // HTML Max Key Code
  let allKeys: {
    keyCode: number;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
  }[] = [];
  for (let k = 0; k <= maxKey; k++) {
    for (let j = 0; j <= 15; j++) {
      const guide = (j >>> 0).toString(2).padStart(4, "0");
      allKeys.push({
        keyCode: k,
        ctrlKey: guide[0] === "1",
        altKey: guide[1] === "1",
        shiftKey: guide[2] === "1",
        metaKey: guide[3] === "1",
      });
    }
  }
  const keyRes = csi.registerKeyEventsInterest(JSON.stringify(allKeys));
  console.log("Key Events Registered Completed: " + keyRes);
};

export const textCepPatch = (e: KeyboardEvent) => {
  const isMac = os.platform() === "darwin";
  if (!isMac) return; // Only needed on MacOS, Windows handles this natively

  // console.log("keyup", e);

  const isShiftKey = e.shiftKey;
  const input = e.target as HTMLTextAreaElement | HTMLInputElement;
  const start = input.selectionStart;
  let end = input.selectionEnd;

  const selectionExists = start !== null && end !== null && start !== end;

  if (start === null || end === null) return;

  if (e.key === "ArrowLeft") {
    if (start === 0) return; // Prevents going to -1
    if (isShiftKey) {
      input.setSelectionRange(start - 1, end);
    } else {
      input.setSelectionRange(start - 1, start - 1);
    }
  } else if (e.key === "ArrowRight") {
    if (end === input.value.length) return; // Prevents going to start
    if (isShiftKey) {
      input.setSelectionRange(start, end + 1);
    } else {
      input.setSelectionRange(end + 1, end + 1);
    }
  }
};

/**
 * Prevents the user from dropping files or URLs onto the panel and navigating away
 */

export const dropDisable = () => {
  window.addEventListener("dragover", (e) => e.preventDefault(), false);
  window.addEventListener("drop", (e) => e.preventDefault(), false);
};
