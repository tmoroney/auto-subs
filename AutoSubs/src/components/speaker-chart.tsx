import * as React from "react"
import { Label, Pie, PieChart } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

export const description = "A donut chart showing speakers and the number of lines"

interface Speaker {
  label: string;
  color: string;
  style: string;
  sample: {
    start: number;
    end: number;
  };
  subtitle_lines: number;
  word_count: number;
}

interface SpeakerChartProps {
  speakerList: Speaker[];
}

export function SpeakerChart({ speakerList }: SpeakerChartProps) {
  // If there are no speakers, use a single data point to render the chart
  const chartData = speakerList.length > 0
    ? speakerList.map(speaker => ({
      speaker: speaker.label,
      lines: speaker.subtitle_lines,
      fill: speaker.color,
    }))
    : [{ speaker: "No speakers", lines: 1, fill: "#D3D3D3" }]; // Grey color for "No speakers"

  const chartConfig = speakerList.reduce<Record<string, { label: string; color: string }>>((config, speaker) => {
    config[speaker.label] = {
      label: speaker.label,
      color: speaker.color,
    }
    return config
  }, {})

  const totalLines = React.useMemo(() => {
    return speakerList.length > 0
      ? speakerList.reduce((acc, curr) => acc + curr.subtitle_lines, 0)
      : 0;
  }, [speakerList])

  return (
    <ChartContainer
      config={chartConfig}
      className="mx-auto aspect-square max-h-[250px]"
    >
      <PieChart>
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent hideLabel />}
        />
        <Pie
          data={chartData}
          dataKey="lines"
          nameKey="speaker"
          innerRadius={60}
          strokeWidth={60}
        >
          <Label
            content={({ viewBox }) => {
              if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                return (
                  <text
                    x={viewBox.cx}
                    y={viewBox.cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    <tspan
                      x={viewBox.cx}
                      y={viewBox.cy}
                      className="fill-foreground text-3xl font-bold"
                    >
                      {totalLines.toLocaleString()}
                    </tspan>
                    <tspan
                      x={viewBox.cx}
                      y={(viewBox.cy || 0) + 24}
                      className="fill-muted-foreground"
                    >
                      Lines
                    </tspan>

                  </text>
                )
              }
              return null;
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  )
}
