import { Grid, GridBase } from "@xtia/grid";
import { byte437ToWideChar, wideCharToByte437 } from "./cp437";
import { BackgroundColour, CanvasContainer, CrtFont, ForegroundColour, LineSet } from "./types";
import { RGBA } from "@xtia/rgba";
import { renderRGBAPipe } from "@xtia/pipe2d-image";
import { egaPalette } from "@xtia/rgba/palettes";

export type EGATextCell = {
	fg: ForegroundColour;
	bg: BackgroundColour;
	char: number;
}

const mkCell = (fg: ForegroundColour, bg: BackgroundColour, char: number | string) => ({fg, bg, char: typeof char == "number" ? char : wideCharToByte437(char)});

type CRTOptions = {
	pascalCoordinates?: boolean;
	lockScroll?: boolean;
	drawLineBreaks?: boolean;
}

type Writable = string | number | Writable[];

interface Pen {
	put(x: number, y: number, char: number | string): void;
	drawBorder(style: LineSet): void;
	write(x: number, y: number, ...text: Writable[]): void;
}

type NonFunction = string | number | boolean | object | symbol | bigint | null | undefined;
const resolveValue = <T extends NonFunction>(source: T | (() => T)) => {
	return typeof source == "function" ? source() : source;
};

export class EGAText<G extends Grid<EGATextCell> = Grid<EGATextCell>> {
	static init(width: number, height: number) {
		const grid = Grid.solid(width, height, mkCell(7, 0, 32));
		return new EGAText<GridBase<EGATextCell>>(grid);
	}

	static wrap<T extends Grid<EGATextCell>>(source: T) {
		return new EGAText(source);
	}

	protected constructor(readonly grid: G) {}

	get width(){ return this.grid.width }
	get height(){ return this.grid.height }

	region(x: number, y: number, width: number, height: number) {
		return new EGAText(this.grid.region(x, y, width, height));
	}

	getCRT(options?: CRTOptions) {
		return new CRT(this, options);
	}

	inset(margin: number = 1) {
		if (!Number.isInteger(margin)) {
			throw new Error(`Border size must be integer; got ${margin}`);
		}
		return new EGAText(this.grid.region({top: margin, left: margin, right: margin, bottom: margin}));
	}

	pen(foregroundColour: ForegroundColour | (() => ForegroundColour), backgroundColour: BackgroundColour | (() => BackgroundColour)): Pen {
		const put = (x: number, y: number, char: number | string) => {
			const fg = resolveValue(foregroundColour);
			const bg = resolveValue(backgroundColour);
			this.grid.set(x, y, {bg, fg, char: typeof char == "string" ? wideCharToByte437(char) : char});
		};
		const write = (x: number, y: number, ..._text: Writable[]) => {
			const writeNext = (v: Writable) => {
				if (typeof v == "string") v = [...v].map(wideCharToByte437);
				if (Array.isArray(v)) return v.forEach(writeNext);
				if (x <= this.width) {
					if (x < this.width) put(x++, y, v);
				}
			}
			writeNext(_text);
		};
		return {
			put,
			write,
			drawBorder: (lineSet) => {
				this.grid.batchUpdate(() => {
					put(0, 0, resolveValue(lineSet.corners.topLeft));
					for (let x = 1; x < this.width - 1; x++) {
						put(x, 0, resolveValue(lineSet.straight.horiz));
					}
					put(this.width - 1, 0, resolveValue(lineSet.corners.topRight));
					for (let y = 1; y < this.height - 1; y++) {
						put(0, y, resolveValue(lineSet.straight.vert));
						put(this.width - 1, y, resolveValue(lineSet.straight.vert));
					}
					put(0, this.height - 1, resolveValue(lineSet.corners.bottomLeft));
					for (let x = 1; x < this.width - 1; x++) {
						put(x, this.height - 1, resolveValue(lineSet.straight.horiz));
					}
					put(this.width - 1, this.height - 1, resolveValue(lineSet.corners.bottomRight));
				});
			}
		}
	}

	getRenderer(font: CrtFont, colours: ArrayLike<RGBA> = egaPalette) {
		const cache = new Map<string, OffscreenCanvas>;
		const tilePipe = this.grid.values.map((cell: EGATextCell) => {
			const cacheKey = `${cell.char},${cell.fg},${cell.bg}`;
			if (cache.has(cacheKey)) return cache.get(cacheKey)!;
			const fgc = colours[cell.fg];
			const bgc = colours[cell.bg];
			const charPipe = font[cell.char]
				.map(v => v === 0 ? bgc : v === 1 ? fgc : bgc.blend(fgc, v));
			const tile = renderRGBAPipe(charPipe);
			cache.set(cacheKey, tile);
			return tile;
		});

		const grid = this.grid;

		function rendertoCanvas(target?: HTMLCanvasElement): HTMLCanvasElement
		function rendertoCanvas<T extends CanvasContainer>(target?: T): T
		function rendertoCanvas(target?: HTMLCanvasElement | CanvasContainer) {
			const tileWidth = font[42].width;
			const tileHeight = font[42].height;
			const width = tileWidth * grid.width;
			const height = tileHeight * grid.height;
			const canvas = new OffscreenCanvas(width, height);
			const ctx = canvas.getContext("2d")!;
			for (let y = 0; y < grid.height; y++) {
				for (let x = 0; x < grid.width; x++) {
					ctx.drawImage(tilePipe.get(x, y), x * tileWidth, y * tileHeight);
				}
			}
			if (target) {
				const targetCanvas = target instanceof HTMLElement ? target : target.element;
				targetCanvas.getContext("2d")!.drawImage(canvas, 0, 0, targetCanvas.width, targetCanvas.height);
				return target;
			}
			return canvas;
		}

		return {
			toCanvas: rendertoCanvas,
			toString: (lineBreak: string = "\n") => {
				return this.grid.values.map(c => byte437ToWideChar(c.char))
					.rows.map(row => row.join("")).join(lineBreak);
			},
			toHTML: () => {
				return this.grid.values.map(c => {
					return `<span style="background-color: ${colours[c.bg]}; color: ${colours[c.fg]}">${byte437ToWideChar(c.char)}</span>`;
				}).rows.map(row => row.join("")).join("<br>");
			}
		};

	}
}

export class CRT<T extends EGAText = EGAText> {
	private pascalCoordinates: boolean;
	private lockScroll: boolean;
	private drawLineBreaks: boolean;
	private _currentFg: ForegroundColour;
	private _currentBg: BackgroundColour;
	private _cursorX: number = 0;
	private _cursorY: number = 0;
	readonly width: number;
	readonly height: number;
	constructor(
		readonly screen: T,
		options?: CRTOptions,
		bg: BackgroundColour = 0,
		fg: ForegroundColour = 7
	) {
		this.pascalCoordinates = !!options?.pascalCoordinates
		this.lockScroll = !!options?.lockScroll;
		this.drawLineBreaks = !!options?.drawLineBreaks;
		this._currentBg = bg;
		this._currentFg = fg;
		this.width = screen.width;
		this.height = screen.height;
	}

	get cursorX() { return this.pascalCoordinates ? this._cursorX + 1 : this._cursorX; }
	get cursorY() { return this.pascalCoordinates ? this._cursorY + 1 : this._cursorY; }

	private mkCell(char: string | number) {
		return mkCell(this._currentFg, this._currentBg, char);
	}
	private getPen() {
		return this.screen.pen(this._currentFg, this._currentBg);
	}

	gotoXY(x: number, y: number) {
		[this._cursorX, this._cursorY] = this.pascalCoordinates ? [x - 1, y - 1] : [x, y];
	}
	clrScr() {
		this.screen.grid.fill({char: 32, fg: this._currentFg, bg: this._currentBg});
	}
	clrEol() {
		this.screen.grid.region(
			this._cursorX,
			this._cursorY,
			this.width - this._cursorX,
			1
		).fill(this.mkCell(32));
	}
	delLine() {
		this.screen.grid.region(
			0,
			this._cursorY,
			this.width,
			this.height - this._cursorY
		).scroll(0, -1, this.mkCell(" "));
	}
	insLine() {
		this.screen.grid.region(
			0,
			this._cursorY,
			this.width,
			this.height - this._cursorY
		).scroll(0, 1, this.mkCell(" "));
	}
	setForeground(v: ForegroundColour) { this._currentFg = v }
	setBackground(v: BackgroundColour) { this._currentBg = v }
	region(x: number, y: number, width: number, height: number, options: CRTOptions = {}) {
		return new CRT(this.screen.region(x, y, width, height), {
			pascalCoordinates: this.pascalCoordinates,
			lockScroll: this.lockScroll,
			drawLineBreaks: this.drawLineBreaks,
			...options
		});
	}
	inset(margin: number = 1) {
		return new CRT(this.screen.inset(margin));
	}

	drawBorder(style: LineSet) {
		this.getPen().drawBorder(style);
	}
	write(...s: (string | number)[]) {
		const pen = this.getPen();
		this.screen.grid.batchUpdate(() => {
			[...s.join("")].forEach(char => {
				if (!this.drawLineBreaks && char == "\n") {
					this._cursorY++;
					this._cursorX = 0;
				} else {
					pen.put(this._cursorX++, this._cursorY, char);
					if (this._cursorX == this.width) {
						this._cursorX = 0;
						this._cursorY++;
					}
				}
				if (this._cursorY == this.height) {
					if (!this.lockScroll) this.screen.grid.scroll(0, -1, this.mkCell(" "));
					this._cursorY--;
				}
			});
		});
	}
	writeLn(...text: (string | number)[]) {
		this.write(...text);
		this._cursorY++;
		this._cursorX = 0;
		if (this._cursorY == this.height) {
			if (!this.lockScroll) this.screen.grid.scroll(0, -1, this.mkCell(32));
			this._cursorY--;
		}
	}
}
