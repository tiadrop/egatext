import { Pipe2D } from "@xtia/pipe2d";
import { CRT } from "./egatext";
import { byte437ToWideChar, wideCharToByte437 } from "./cp437";
import { BackgroundColour, EGATextCell, ForegroundColour } from "./types";

const egaColourToAnsi = [0, 4, 2, 6, 1, 5, 3, 7];
const ansiColourToEGA = Array.from({length: 8}, (_, i) => egaColourToAnsi.indexOf(i));

export function toANSIUnicode(screen: Pipe2D<EGATextCell>, lineBreak: string) {
	let lastFg = -1;
	let lastBg = -1;
	let lastBlink = false;

	return "\x1b[0m" + screen.rows.map(row => {
		let s = "";
		for (const cell of row) {			
			if (cell.bg !== lastBg) {
				s += `\x1b[${egaColourToAnsi[cell.bg] + 40}m`;
				lastBg = cell.bg;
			}
			if (cell.fg !== lastFg && cell.char !== 32) {
				const base = cell.fg > 7 ? 90 : 30;
				s += `\x1b[${egaColourToAnsi[cell.fg % 8] + base}m`;
				lastFg = cell.fg;
			}
			if (cell.blink !== lastBlink) {
				s += cell.blink ? "\x1b[5m" : "\x1b[25m";
				lastBlink = !!cell.blink;
			}
			s += byte437ToWideChar(cell.char);
		};
		return s;
	}).join(lineBreak);
}

export function toANSIBytes(screen: Pipe2D<EGATextCell>) {
	const byteValues: number[] = [];
	let lastBg = -1;
	let lastFg = -1;
	let lastBlink = false;

	screen.rows.forEach(row => {
		for (const cell of row) {
			// apply attrs
			const codes: number[] = [];
			if (lastFg !== cell.fg) {
				if (cell.fg > 7) {
					// intense
					if (lastFg <= 7) {
						codes.push(1);
					}
				} else {
					if (lastFg > 7) {
						codes.push(0);
						lastFg = -1;
						lastBg = -1;
						lastBlink = false;
					}
				}
				if (lastFg % 8 !== cell.fg % 8) {
					codes.push(30 + egaColourToAnsi[cell.fg % 8]);
				}
				lastFg = cell.fg;

			}
			if (lastBg !== cell.bg) {
				lastBg = cell.bg;
				codes.push(40 + egaColourToAnsi[cell.bg]);
			}
			if (cell.blink) {
				if (!lastBlink) codes.push(5);
				lastBlink = true;
			} else {
				if (lastBlink) codes.push(25);
				lastBlink = false;
			}

			if (codes.length > 0) {
				const sequence = [...codes.join(";") + "m"].map(wideCharToByte437);
				byteValues.push(27 /* ESC */, 91 /* [ */, ...sequence)
			}
			
			byteValues.push(cell.char);

		}
	});
	
	return new Uint8ClampedArray(byteValues);
}

const isNumericChar = (byte: number) => byte >= 48 && byte <= 57;

export type WriteAnsiOptions = {
	/**
	 * Removes SAUCE metadata, if present.
	 * 
	 * COMNT stripping is not currently supported.
	 */
	stripSauce?: boolean;
	initialForeground?: ForegroundColour;
	initialBackground?: BackgroundColour;
}

export function writeANSI(crt: CRT, data: Uint8Array | Uint8ClampedArray, options: WriteAnsiOptions) {
	let escSeq: string | null = null;
	let plain: number[] = [];
	let expectingBracket = false;
	let savedCursor: [number, number] = [1, 1];

	if (options.stripSauce) data = stripSauce(data);

	const flush = () => {
		crt.writeBytes(plain);
		plain = [];
	};

	let intense = false;

	const mCommands: Record<number, () => void> = {
		0: () => {
			intense = false;
			crt.foreground = 7;
			crt.blink = false;
			crt.background = 0;
		},
		1: () => {
			intense = true;
			if (crt.foreground < 8) crt.foreground += 8;
		},
		5: () => crt.blink = true,
		25: () => crt.blink = false,
	};

	const processSequence = (commandChar: string) => {
		const params = escSeq ? escSeq!.split(";").map(Number) : [];
		switch  (commandChar) {
			case "m":
				params.forEach(p => {
					if (mCommands[p]) {
						mCommands[p]();
						return;
					}
					if (p >= 30 && p <= 37) {
						const egaColour = ansiColourToEGA[p - 30];
						crt.foreground = (intense ? egaColour + 8 : egaColour) as ForegroundColour;
						return;
					}
					if (p >= 40 && p <= 47) {
						crt.background = ansiColourToEGA[p - 40] as BackgroundColour;
						return;
					}
					if (p >= 90 && p <= 97) {
						crt.foreground = ansiColourToEGA[p - 90] + 8 as ForegroundColour;
						return;
					}
					// ignore unsupported codes
				});
				break;
			case "s":
				savedCursor = [crt.cursorX, crt.cursorY];
				break;
			case "u":
				crt.gotoXY(...savedCursor);
				break;
			case "A": {
				const count = params[0] ?? 1;
				crt.gotoXY(crt.cursorX, Math.max(1, crt.cursorY - count));
				break;
			}
			case "B": {
				const count = params[0] ?? 1;
				crt.gotoXY(crt.cursorX, Math.min(crt.height, crt.cursorY + count));
				break;
			}
			case "C": {
				const count = params[0] ?? 1;
				crt.gotoXY(Math.min(crt.width, crt.cursorX + count), crt.cursorY);
				break;
			}
			case "D": {
				const count = params[0] ?? 1;
				crt.gotoXY(Math.max(1, crt.cursorX - count), crt.cursorY);
				break;
			}
			case "H":
				crt.gotoXY(params[1], params[0]);
				break;
			case "J": {
				const param = params[0] ?? 0;
				switch (param) {
					case 0:
					case 1:
						// unsupported
						break;
					case 2:
					case 3:
						crt.clrScr();
				}
				break;
			}
			case "K": {
				const param = params[0] ?? 0;
				switch (param) {
					case 0:
						crt.clrEol();
						break;
					case 1:
						let x = crt.cursorX;
						crt.gotoXY(1, crt.cursorY);
						crt.clrEol();
						crt.gotoXY(x, crt.cursorY);
						break;
					case 2:
						// unsupported
				}
				break;
			}

			default:
				// ignore unsupported codes?
		}
		escSeq = null;
	};

	for (const byte of data) {
		if (escSeq === null) {
			if (expectingBracket) {
				expectingBracket = false;
				if (byte == 91 /* [ */) {
					flush();
					escSeq = "";
				} else {
					plain.push(27);
				}
				continue;
			}
			if (byte == 27 /* esc */) {
				expectingBracket = true;
				continue;
			}

			plain.push(byte);
			
		} else {
			const char = byte437ToWideChar(byte);
			if (char === ";" || isNumericChar(byte)) {
				escSeq += char;
			} else {
				processSequence(char);
			}
		}
	}

	flush();
}

function matchBytes(a: ArrayLike<number>, b: ArrayLike<number>) {
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

function stripSauce(data: Uint8Array | Uint8ClampedArray) {
	const last128 = data.slice(data.length - 128);
	const signature = [..."SAUCE"].map(wideCharToByte437);
	if (matchBytes(last128.subarray(0, signature.length), signature)) {
		data = data.slice(0, data.length - 128);
		while (data[data.length - 1] == 26) data = data.subarray(0, data.length - 1)
	}
	return data;
}