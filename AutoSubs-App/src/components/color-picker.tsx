import React, { useEffect } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"

type ColorPickerProps = {
    value: string
    onChange: (color: string) => void
    items?: Item[]
}

type Item = {
    value: string
    label: string
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange, items }) => {
    const [color, setColor] = React.useState(value)

    useEffect(() => {
        setColor(value)
    }, [value])

    const handleOnChange = (newColor: string) => {
        setColor(newColor)
        onChange(newColor)
    }

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="secondary" className="gap-2 text-sm w-full">
                    <div
                        className="w-5 h-5 rounded-md border border-white/10"
                        style={{ backgroundColor: color }}
                    />
                    <p>Speaker Color</p>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="space-y-4">
                <Label>Customise subtitles</Label>
                {items && (
                    <div className="flex flex-wrap gap-2">
                        {items.map((item, index) => (
                            <button
                                onClick={() => handleOnChange(item.value)}
                                key={index}
                                className="w-5 h-5 rounded-md aspect-square border"
                                style={{ backgroundColor: item.value }}
                            />
                        ))}
                    </div>
                )}
                <Input
                    value={color}
                    onChange={({ currentTarget }) => handleOnChange(currentTarget.value)}
                />
            </PopoverContent>
        </Popover>
    )
}