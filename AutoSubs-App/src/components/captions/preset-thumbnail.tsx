import * as React from "react";
import { Check, Image as ImageIcon } from "lucide-react";
import { CaptionPreset } from "@/types";
import { cn } from "@/lib/utils";
import { CAPTION_PREVIEW_DIR, previewSrc } from "@/lib/caption-previews";

/**
 * Directory (under the app local data dir) holding one thumbnail per animated
 * preset. Previews are captured when a preset is saved and named after the
 * preset id, so deleting a preset can delete its image by convention.
 */
export { CAPTION_PREVIEW_DIR };

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

    previewSrc(
      preset.previewImage,
      preset.previewUpdatedAt ?? preset.updatedAt,
    )
      .then((path) => {
        if (!cancelled) setSrc(path);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [preset.previewImage, preset.previewUpdatedAt, preset.updatedAt]);

  const showImage = Boolean(src) && !failed;

  return (
    <div
      className={cn(
        // Previews render with a transparent background, so they sit on a dark
        // neutral in both themes: captions are designed to overlay footage, and
        // light-filled text is invisible against a light card.
        "relative flex h-9 w-16 shrink-0 items-center justify-center overflow-hidden rounded border bg-neutral-800",
        selected ? "border-primary" : "border-border",
        className,
      )}
    >
      {showImage ? (
        <img
          src={src!}
          alt=""
          // `absolute inset-0` rather than `size-full`: the container sizes
          // itself from `aspect-video`, which leaves its height indefinite, so
          // a percentage height on the image falls back to the image's
          // intrinsic height and overflows the (centred, clipped) box.
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <ImageIcon className="size-4 text-white/40" />
      )}

      {selected && (
        <span className="absolute bottom-2 right-2 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
          <Check className="size-2.5" />
        </span>
      )}
    </div>
  );
}
