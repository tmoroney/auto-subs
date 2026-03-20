import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

type UpdatePhase = "idle" | "downloading" | "ready" | "error";

interface UpdateStatus {
  phase: UpdatePhase;
  percentage: number | null;
}

export function useUpdateStatus(): UpdateStatus {
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [percentage, setPercentage] = useState<number | null>(null);

  useEffect(() => {
    const unlisten: Array<() => void> = [];

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
        await listen("update-error", () => {
          setPhase("error");
          setPercentage(null);
          // Revert to idle after a few seconds so ResolveStatus reappears
          setTimeout(() => setPhase("idle"), 5000);
        })
      );
    };

    setup();

    return () => {
      unlisten.forEach((fn) => fn());
    };
  }, []);

  return { phase, percentage };
}
