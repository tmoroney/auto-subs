import * as React from "react"
import { TrendingUp } from "lucide-react"
import { Label, Pie, PieChart } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

export const description = "A donut chart showing speakers and the number of lines"

interface Speaker {
  label: string;
  lines: number;
  color: string;
}

interface SpeakerChartProps {
  speakerList: Speaker[];
}

export function SpeakerChart({ speakerList }: SpeakerChartProps) {
  const chartData = speakerList.map(speaker => ({
    speaker: speaker.label,
    lines: speaker.lines,
    fill: speaker.color,
  }))

  const chartConfig = speakerList.reduce<Record<string, { label: string; color: string }>>((config, speaker) => {
    config[speaker.label] = {
      label: speaker.label,
      color: speaker.color,
    }
    return config
  }, {})

  const totalLines = React.useMemo(() => {
    return speakerList.reduce((acc, curr) => acc + curr.lines, 0)
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
              strokeWidth={5}
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
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
  )
}
