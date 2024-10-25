import React, { useEffect } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { Button } from "./button"
import { Input } from "./input"
import { Badge } from "@/components/ui/badge"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Label } from "./label"
import { TypeOutline } from "lucide-react"

type ColorPickerProps = {
    value: string
    onChange: (data: { color: string, style: string }) => void
    items?: Item[]
}

type Item = {
    value: string;
    label: string;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange, items }) => {
    const [color, setColor] = React.useState(value)
    const [style, setStyle] = React.useState("Outline")

    useEffect(() => {
        setColor(value)
    }, [value])

    const handleOnChange = (color: string, style: string) => {
        setColor(color)
        onChange({ color, style }) // Pass both color and style
    }

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="secondary" className="gap-2 text-sm w-full">
                    <div style={{ backgroundColor: color }} className="w-5 h-5 rounded-md border border-white/10"></div>
                    <p>{style} Color</p>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="space-y-4">
                <Label>Customise subtitles</Label>
                {items &&
                    <div className="flex flex-wrap gap-2">
                        {items.map((item, index) => (
                            <button
                                onClick={() => handleOnChange(item.value, style)} // Pass the selected style too
                                key={index}
                                className="w-5 h-5 rounded-md aspect-square border"
                                style={{ backgroundColor: item.value }}
                            />
                        ))}
                    </div>
                }
                <Input
                    value={color}
                    onChange={({ currentTarget }) => handleOnChange(currentTarget.value, style)}
                />
                <Select defaultValue={style} onValueChange={(value) => { setStyle(value); handleOnChange(color, value); }}>
                    <SelectTrigger>
                        <SelectValue placeholder="Outline" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="Outline">Use Subtitle Outline</SelectItem>
                        <SelectItem value="Fill">Use Subtitle Fill</SelectItem>
                    </SelectContent>
                </Select>
            </PopoverContent>
        </Popover>
    )
}