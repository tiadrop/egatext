import { Pipe2D } from "@xtia/pipe2d";
import { EGATextCell } from "./egatext";
import { byte437ToWideChar } from "./cp437";

const colourTable = [0, 4, 2, 6, 1, 5, 3, 7];

export function toANSI(screen: Pipe2D<EGATextCell>, lineBreak: string, blinking: boolean) {
	let lastFg = -1;
	let lastBg = -1;

	return "\x1b[0m" + screen.rows.map(row => {
		let s = "";
		for (let cell of row) {
			if (cell.bg !== lastBg) {
				s += "\x1b[" + (colourTable[cell.bg] + 40) + "m";
				lastBg = cell.bg;
			}
			if (cell.fg !== lastFg && cell.char !== 32) {
				const base = cell.fg > 7 ? 90 : 30;
				s += "\x1b[" + (colourTable[cell.fg % 8] + base) + "m";
				lastFg = cell.fg;
			}
			s += byte437ToWideChar(blinking && cell.blink ? 32 : cell.char);
		};
		return s;
	}).join(lineBreak);
}