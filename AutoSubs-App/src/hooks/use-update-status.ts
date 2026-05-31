import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

export const UPDATE_RESTART_NOTICE_KEY = "autosubs-update-restart-notice";

type UpdatePhase =
  | "idle"
  | "downloading"
  | "ready"
  | "installing"
  | "restarting"
  | "available-link"
  | "error";

interface UpdateStatus {
  phase: UpdatePhase;
  percentage: number | null;
  version: string | null;
}

export function useUpdateStatus(): UpdateStatus {
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [percentage, setPercentage] = useState<number | null>(null);
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    const unlisten: Array<() => void> = [];
    let errorTimeout: ReturnType<typeof setTimeout> | null = null;

    const setup = async () => {
      unlisten.push(
        await listen<{ percentage: number; downloaded: number; total: number }>(
          "update-progress",
          (event) => {
            setPhase("downloading");
            setPercentage(Math.round(event.payload.percentage));
          }
        )
      );

      unlisten.push(
        await listen("update-ready", () => {
          setPhase("ready");
          setPercentage(null);
        })
      );

      unlisten.push(
        await listen("update-installing", () => {
          setPhase("installing");
          setPercentage(null);
        })
      );

      unlisten.push(
        await listen("update-restarting", () => {
          localStorage.setItem(UPDATE_RESTART_NOTICE_KEY, "1");
          setPhase("restarting");
          setPercentage(null);
        })
      );

      unlisten.push(
        await listen<{ version: string }>("update-available-link", (event) => {
          setPhase("available-link");
          setVersion(event.payload.version);
        })
      );

      unlisten.push(
        await listen("update-error", () => {
          localStorage.removeItem(UPDATE_RESTART_NOTICE_KEY);
          setPhase("error");
          setPercentage(null);
          if (errorTimeout) clearTimeout(errorTimeout);
          errorTimeout = setTimeout(() => setPhase("idle"), 5000);
        })
      );
    };

    setup();

    return () => {
      unlisten.forEach((fn) => fn());
      if (errorTimeout) clearTimeout(errorTimeout);
    };
  }, []);

  return { phase, percentage, version };
}
