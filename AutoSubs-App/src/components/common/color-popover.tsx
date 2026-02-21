import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";

interface ColorPopoverProps {
  label: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  color: string;
  onColorChange: (color: string) => void;
  presetColors?: string[];
  disabled?: boolean;
}

const DEFAULT_PRESETS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];

export function ColorPopover({
  label,
  enabled,
  onEnabledChange,
  color,
  onColorChange,
  presetColors = DEFAULT_PRESETS,
  disabled = false,
}: ColorPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-9 h-9 p-0 rounded-full border"
          disabled={disabled}
        >
          {enabled ? (
            <span
              className="w-5 h-5 rounded-full border-2"
              style={{ backgroundColor: color, borderColor: color }}
            />
          ) : (
            <span className="flex items-center justify-center w-5 h-5 rounded-full border-2 bg-muted text-muted-foreground">
              <X className="w-3 h-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 space-y-4">
        <div className="flex items-center gap-2">
          <Switch
            id={`toggle-${label.replace(/\s+/g, "-").toLowerCase()}`}
            checked={enabled}
            onCheckedChange={(checked: boolean) => onEnabledChange(!!checked)}
            aria-label={`${label} Enabled`}
          />
          <Label htmlFor={`toggle-${label.replace(/\s+/g, "-").toLowerCase()}`}>{label}</Label>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => onColorChange(e.target.value)}
            disabled={!enabled}
            className="w-10 h-10 rounded-md border-2 border-input bg-background disabled:opacity-50"
          />
          <Input
            value={color}
            onChange={(e) => onColorChange(e.target.value)}
            disabled={!enabled}
            className="font-mono flex-1"
            placeholder="#000000"
            maxLength={7}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {presetColors.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`w-7 h-7 rounded border-2 flex items-center justify-center transition-colors ${color === preset && enabled ? "border-black dark:border-white" : "border-transparent"} ${!enabled ? "opacity-50" : ""}` }
              style={{ backgroundColor: preset }}
              onClick={() => enabled && onColorChange(preset)}
              aria-label={`Select color ${preset}`}
              disabled={!enabled}
            >
              {color === preset && enabled && <Check className="w-4 h-4 text-white drop-shadow dark:text-black" />}
            </button>
          ))}
        </div>

      </PopoverContent>
    </Popover>
  );
}
