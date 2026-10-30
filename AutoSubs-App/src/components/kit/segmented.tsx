import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { cn } from "@/lib/utils";

interface SegmentedOption {
  label: string;
  value: string;
}

interface SegmentedProps {
  options: SegmentedOption[];
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}

export function Segmented({
  options,
  value,
  onValueChange,
  ariaLabel,
  className,
}: SegmentedProps) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(nextValue: string) => onValueChange(nextValue)}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex h-9 items-center gap-0.5 rounded-[var(--as-radius)] border-none bg-[var(--as-card)] p-[3px] text-sm leading-[normal]",
        className,
      )}
    >
      {options.map((option) => (
        <Radio.Root
          key={option.value}
          value={option.value}
          className="as-segmented-option inline-flex h-[26px] cursor-pointer items-center justify-center rounded-[7px] border-none px-3 py-[5px] text-[13px] leading-[normal] font-normal text-[var(--as-fg-secondary)] outline-none transition-colors data-[checked]:bg-[var(--as-seg-on)] data-[checked]:text-[var(--as-fg)]"
        >
          {option.label}
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}
