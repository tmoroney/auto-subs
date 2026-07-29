import * as React from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { Check, Image as ImageIcon } from "lucide-react";
import { CaptionPreset } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Directory (under the app data dir) holding one thumbnail per animated
 * preset. Previews are captured when a preset is saved and named after the
 * preset id, so deleting a preset can delete its image by convention.
 */
export const CAPTION_PREVIEW_DIR = "caption-previews";

/**
 * Preview thumbnail for an animated caption preset. Falls back to a
 * placeholder until a preview image has been captured for the preset.
 *
 * Only animated presets have previews — regular Resolve templates render
 * without a thumbnail and without reserving space for one.
 */
export function PresetThumbnail({
  preset,
  selected,
  className,
}: {
  preset: CaptionPreset;
  selected?: boolean;
  className?: string;
}) {
  const [src, setSrc] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setSrc(null);
    if (!preset.previewImage) return;

    appDataDir()
      .then((dir) => join(dir, CAPTION_PREVIEW_DIR, preset.previewImage!))
      .then((path) => {
        if (!cancelled) setSrc(convertFileSrc(path));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [preset.previewImage]);

  const showImage = Boolean(src) && !failed;

  return (
    <div
      className={cn(
        "relative flex h-9 w-16 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted",
        selected ? "border-primary" : "border-border",
        className,
      )}
    >
      {showImage ? (
        <img
          src={src!}
          alt=""
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <ImageIcon className="size-4 text-muted-foreground/50" />
      )}

      {selected && (
        <span className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
          <Check className="size-2.5" />
        </span>
      )}
    </div>
  );
}
