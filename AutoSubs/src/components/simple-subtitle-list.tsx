import { Subtitle, SubtitleListProps } from '../types/interfaces'; 

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const invoices = [
  {
    start: "3:20",
    text: "This is a subtitle",
  },
  {
    start: "4:60",
    text: "This is also a subtitle",
  },
  {
    start: "5:20",
    text: "This is a subtitle",
  },
  {
    start: "6:60",
    text: "This is also a subtitle",
  },
  {
    start: "7:20",
    text: "This is a subtitle",
  },
  {
    start: "8:60",
    text: "This is also a subtitle",
  },
  {
    start: "9:20",
    text: "This is a subtitle",
  },
  {
    start: "10:60",
    text: "This is also a subtitle",
  },
  {
    start: "11:20",
    text: "This is a subtitle",
  },
]

export function SubtitleList({ subtitles }: SubtitleListProps) {
  return (
    <Table>
      <TableCaption>Overview of generated subtitles.</TableCaption>
      <TableHeader className="pointer-events-none">
        <TableRow>
          <TableHead className="w-[40px]">Start</TableHead>
          <TableHead>Subtitle Text</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {subtitles.map((subtitle: Subtitle) => (
          <TableRow key={subtitle.start}>
            <TableCell className="font-medium">{parseFloat(subtitle.start).toFixed(2)}</TableCell>
            <TableCell>{subtitle.text}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
