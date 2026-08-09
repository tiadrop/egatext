import { Grid, GridBase } from "@xtia/grid";
import { byte437ToWideChar, wideCharToByte437 } from "./cp437.js";
import { BackgroundColour, CanvasContainer, CrtFont, ForegroundColour, LineSet } from "./types.js";
import { parseRGBA, RGBA } from "@xtia/rgba";
import { renderRGBAPipe } from "@xtia/pipe2d-image";
import { egaPalette } from "@xtia/rgba/palettes";
import { lineSets } from "./charsets.js";

const transparent = new RGBA(0, 0, 0, 0);

export type EGATextCell = {
	fg: ForegroundColour;
	bg: BackgroundColour;
	char: number;
}

const mkCell = (fg: ForegroundColour, bg: BackgroundColour, char: number | string) => ({fg, bg, char: typeof char == "number" ? char : wideCharToByte437(char)});

type CRTOptions = {
	pascalCoordinates?: boolean;
	lockScroll?: boolean;
}

type Writable = string | number | Writable[];

function getLineSet(styleOrHoriz: LineSet | 1 | 2, vert?: 1 | 2): LineSet {
	if (vert) {
		const horizSet = lineSets[vert == 1 ? "singleHoriz" : "doubleHoriz"];
		return horizSet[styleOrHoriz == 1 ? "singleVert" : "doubleVert"];
	}
	return styleOrHoriz as LineSet;
}

export interface Pen {
	put(x: number, y: number, char: number | string): void;
	drawBorder(style: LineSet): void;
	drawBorder(horizontalLines: 1 | 2, verticalLines: 1 | 2): void;
	write(x: number, y: number, ...text: Writable[]): void;
	fill(char: number | string): void;
}

type NonFunction = string | number | boolean | object | symbol | bigint | null | undefined;
const resolveValue = <T extends NonFunction>(source: T | (() => T)) => {
	return typeof source == "function" ? source() : source;
};

type AutoRenderOptions = {
	font: CrtFont;
	target: HTMLCanvasElement | CanvasContainer | string;
	palette?: ArrayLike<RGBA | string>;
}

function createScheduleFn<F extends (...args: any[]) => void>(fn: F): F {
	let scheduled = false;
	return ((...args: any[]) => {
		if (scheduled) return;
		scheduled = true;
		requestAnimationFrame(() => {
			scheduled = false;
			fn(...args);
		});
	}) as F;
}

export class EGAText<G extends Grid<EGATextCell> = Grid<EGATextCell>> {

	static init(width: number, height: number, renderOptions?: AutoRenderOptions): EGAText<GridBase<EGATextCell>> {
		const grid = Grid.solid(width, height, mkCell(7, 0, 32));
		const screen = new EGAText<GridBase<EGATextCell>>(grid);
		if (renderOptions) {
			const renderer = screen.getRenderer(
				renderOptions.font,
				renderOptions.palette && Array.from(renderOptions.palette)
					.map(c => typeof c == "string" ? parseRGBA(c) : c)
			);

			let canvas: HTMLCanvasElement | CanvasContainer;
			if (typeof renderOptions.target == "string") {
				canvas = document.getElementById(renderOptions.target) as HTMLCanvasElement;
				if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
					throw new Error("Selector did not yield a valid render target");
				}
			} else canvas = renderOptions.target;

			screen.grid.on("change", createScheduleFn(() => {
				renderer(canvas)
			}));
		}
		return screen;
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
		const write = (x: number, y: number, ..._text: (string | number)[]) => {
			[..._text.join("")].forEach(wc => {
				if (x < this.width) put(x++, y, wc);
			});
		};
		return {
			put,
			write,
			fill: (char) => {
				const fg = resolveValue(foregroundColour);
				const bg = resolveValue(backgroundColour);
				this.grid.fill(mkCell(fg, bg, char));
			},
			drawBorder: (setOrHoriz, vert?: 1 | 2) => {
				const lineSet = getLineSet(setOrHoriz, vert);
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


	toString(lineBreak: string = "\n") {
		return this.grid.values.map(c => byte437ToWideChar(c.char))
			.rows.map(row => row.join("")).join(lineBreak);
	}

	toHTML(colours: ArrayLike<RGBA | string> = egaPalette, lineBreak: string = "<br>") {
		return this.grid.values.map(c => {
			return `<span style="background-color: ${
				colours[c.bg] ?? transparent
			}; color: ${
				colours[c.fg] ?? transparent
			}">${byte437ToWideChar(c.char)}</span>`;
		}).rows.map(row => row.join("")).join(lineBreak);
	}

	getRenderer(font: CrtFont, colours: ArrayLike<RGBA> = egaPalette) {
		const cache = new Map<string, OffscreenCanvas>;
		const tilePipe = this.grid.values.map((cell: EGATextCell) => {
			const cacheKey = `${cell.char},${cell.fg},${cell.bg}`;
			if (cache.has(cacheKey)) return cache.get(cacheKey)!;
			const fgc = colours[cell.fg] ?? transparent;
			const bgc = colours[cell.bg] ?? transparent;
			const charPipe = font[cell.char]
				.map(v => v === 0 ? bgc : v === 1 ? fgc : bgc.blend(fgc, v));
			const tile = renderRGBAPipe(charPipe);
			cache.set(cacheKey, tile);
			return tile;
		});

		const grid = this.grid;
		const measureTile = font[1];
		const tileWidth = measureTile.width;
		const tileHeight = measureTile.height;

		function rendertoCanvas(): OffscreenCanvas
		function rendertoCanvas<T extends HTMLCanvasElement | CanvasContainer>(target?: T): T
		function rendertoCanvas(canvasSelector: string): HTMLCanvasElement
		function rendertoCanvas(target?: HTMLCanvasElement | CanvasContainer | string) {
			const canvas = new OffscreenCanvas(
				tileWidth * grid.width,
				tileHeight * grid.height
			);
			const ctx = canvas.getContext("2d")!;
			for (let y = 0; y < grid.height; y++) {
				for (let x = 0; x < grid.width; x++) {
					ctx.drawImage(tilePipe.get(x, y), x * tileWidth, y * tileHeight);
				}
			}
			if (target) {
				if (typeof target == "string") {
					const element = document.body.querySelector(target);
					if (!element || !(element instanceof HTMLCanvasElement)) throw new Error("Selector did not yield a valid render target");
					target = element;
				}
				const targetCanvas = target instanceof HTMLElement ? target : target.element;
				targetCanvas.getContext("2d")!.drawImage(canvas, 0, 0, targetCanvas.width, targetCanvas.height);
				return target;
			}
			return canvas;
		}

		return rendertoCanvas;

	}
}

export class CRT<T extends EGAText = EGAText> {
	private pascalCoordinates: boolean;
	private lockScroll: boolean;
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
		).scroll(0, -1, this.mkCell(32));
	}
	insLine() {
		this.screen.grid.region(
			0,
			this._cursorY,
			this.width,
			this.height - this._cursorY
		).scroll(0, 1, this.mkCell(32));
	}
	setForeground(v: ForegroundColour) { this._currentFg = v }
	setBackground(v: BackgroundColour) { this._currentBg = v }
	region(x: number, y: number, width: number, height: number, options: CRTOptions = {}) {
		return new CRT(this.screen.region(x, y, width, height), {
			pascalCoordinates: this.pascalCoordinates,
			lockScroll: this.lockScroll,
			...options
		});
	}
	inset(margin: number = 1) {
		return new CRT(this.screen.inset(margin));
	}

	drawBorder(lineSet: LineSet): void
	drawBorder(horizontalLines: 1 | 2, verticalLines: 1 | 2): void
	drawBorder(setOrHoriz: LineSet | 1 | 2, vert?: 1 | 2): void {
		const set = getLineSet(setOrHoriz, vert);
		this.getPen().drawBorder(set);
	}
	write(...s: (string | number)[]) {
		const pen = this.getPen();
		this.screen.grid.batchUpdate(() => {
			[...s.join("")].forEach(char => {
				pen.put(this._cursorX++, this._cursorY, char);
				if (this._cursorX == this.width) {
					this._cursorX = 0;
					this._cursorY++;
				}
				if (this._cursorY == this.height) {
					if (!this.lockScroll) this.screen.grid.scroll(0, -1, this.mkCell(32));
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
