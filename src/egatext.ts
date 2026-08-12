import { Grid, GridBase } from "@xtia/grid";
import { byte437ToWideChar, wideCharToByte437 } from "./cp437.js";
import { BackgroundColour, CanvasContainer, CrtFont, EGAData, ForegroundColour, LineSet } from "./types.js";
import { parseRGBA, RGBA } from "@xtia/rgba";
import { renderRGBAPipe } from "@xtia/pipe2d-image";
import { egaPalette } from "@xtia/rgba/palettes";
import { lineSets } from "./charsets.js";
import { toANSI } from "./ansi.js";

const BLINK_RATE = 2.1666; //hz

const black = new RGBA(0, 0, 0);

export type EGATextCell = {
	readonly fg: ForegroundColour;
	readonly bg: BackgroundColour;
	readonly char: number;
	readonly blink?: boolean;
}

const mkCell = (fg: ForegroundColour, bg: BackgroundColour, char: number | string, blink?: boolean): EGATextCell => ({fg, bg, char: typeof char == "number" ? char : wideCharToByte437(char), ...(blink?{blink}:{})});

const cellToBytes = (cell: EGATextCell) => {
	const safeFg = cell.fg & 0x0F;
	const safeBg = cell.bg & 0x07;
	
	let attr = (safeBg << 4) | safeFg;
	if (cell.blink) {
		attr |= 0x80;
	}

	return new Uint8ClampedArray([attr, cell.char]);
}

const bytesToCell = (bytes: Uint8ClampedArray): EGATextCell => {
	const [attr, char] = bytes;
	const fg = (attr & 0x0F) as ForegroundColour;
	const bg = ((attr >> 4) & 0x07) as BackgroundColour;
	const blink = (attr & 0x80) !== 0;
	return {fg, bg, blink, char};
}

type CRTOptions = {
	pascalCoordinates?: boolean;
	lockScroll?: boolean;
}

const blinkManager = (() => {
	const entries: {fn: () => void}[] = [];
	let state = false;
	let intervalId: ReturnType<typeof setInterval> | null = null;
	const start = () => {
		intervalId = setInterval(() => {
			state = !state;
			[...entries].forEach(e => e.fn());
		}, 500/BLINK_RATE);
	};
	const stop = () => clearInterval(intervalId!);

	return {
		register(fn: () => void): () => void {
			const unique = {fn};
			entries.push(unique);
			if (entries.length == 1) start();

			return () => {
				const idx = entries.indexOf(unique);
				entries.splice(idx, 1);
				if (entries.length == 0) stop();
			}
		},
		get state() { return state }
	}
})();

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
	region?: {
		readonly x: number;
		readonly y: number;
		readonly width: number;
		readonly height: number;
	}
}

type HTMLOptions = {
	palette?: ArrayLike<RGBA | string>;
	lineBreak?: string;
	blinkClass?: string;
}

function someIterator<T>(iterable: Iterable<T>, predicate: (value: T) => boolean): boolean {
	for (const value of iterable) {
		if (predicate(value)) return true;
	}
	return false;
}

function pointInRect(x: number, y: number, rect: {left: number, top: number, right: number, bottom: number}): boolean {
	return x >= rect.left && y >= rect.top && x < rect.right && y < rect.bottom;
}


export class EGAText<G extends Grid<EGATextCell> = Grid<EGATextCell>> {

	static init(width: number, height: number, renderOptions?: AutoRenderOptions): EGAText<GridBase<EGATextCell>> {
		const grid = Grid.solid(width, height, mkCell(7, 0, 32));
		const screen = new EGAText<GridBase<EGATextCell>>(grid);
		if (renderOptions) {
			const renderRegion = renderOptions.region;
			const region = renderRegion
				? screen.liveRegion(renderRegion.x, renderRegion.y, renderRegion.width, renderRegion.height)
				: screen;
			const renderer = region.createRenderer(
				renderOptions.font,
				renderOptions.palette && Array.from(renderOptions.palette)
					.map(c => typeof c == "string" ? parseRGBA(c) : c)
			);

			let target: HTMLCanvasElement | CanvasContainer;
			if (typeof renderOptions.target == "string") {
				target = document.getElementById(renderOptions.target) as HTMLCanvasElement;
				if (!target || !(target instanceof HTMLCanvasElement)) {
					throw new Error("Selector did not yield a valid render target");
				}
			} else target = renderOptions.target;

			const canvasRef = new WeakRef(target instanceof HTMLCanvasElement ? target : target.element);

			let renderQueued = false;

			const scheduleRender = () => {
				if (renderQueued) return;
				renderQueued = true;
				requestAnimationFrame(() => {
					renderQueued = false;
					const canvas = canvasRef.deref();
					if (!canvas) {
						unregisterBlink();
						return;
					}
					renderer(canvas);
				});
			};

			const unregisterBlink = blinkManager.register(scheduleRender);

			const regionRect = renderRegion && {left: renderRegion.x, top: renderRegion.y, right: renderRegion.x + renderRegion.width, bottom: renderRegion.y + renderRegion.height};

			screen.grid.on("change", (ev) => {
				if (renderQueued) return;
				if (
					!regionRect
					|| someIterator(
						ev.changedCells.values(),
						v => pointInRect(v.x, v.y, regionRect)
					)
				) {
					scheduleRender();
				}
			});
		}
		return screen;
	}

	static wrap<T extends Grid<EGATextCell>>(source: T) {
		return new EGAText(source);
	}

	protected constructor(
		readonly grid: G
	) {}

	get width(){ return this.grid.width }
	get height(){ return this.grid.height }

	/**
	 * Defines a live rectangular subregion.
	 * @param x 
	 * @param y 
	 * @param width 
	 * @param height 
	 * @param options 
	 * @returns A live view of a subregion of this screen
	 */
	liveRegion(x: number, y: number, width: number, height: number) {
		return new EGAText(this.grid.liveRegion(x, y, width, height));
	}

	/**
	 * Creates a Pascal CRT-style view of this screen view.
	 * @param options 
	 * @returns 
	 */
	getCRT(options?: CRTOptions) {
		return new CRT(this, options);
	}

	liveInset(margin: number = 1) {
		if (!Number.isInteger(margin)) {
			throw new Error(`Border size must be integer; got ${margin}`);
		}
		return new EGAText(this.grid.liveRegion({top: margin, left: margin, right: margin, bottom: margin}));
	}

	/**
	 * Creates a drawing context with specified foreground, background and blink attributes.
	 * @param foregroundColour 
	 * @param backgroundColour 
	 * @param blink 
	 * @returns A Pen drawing context
	 */
	pen(foregroundColour: ForegroundColour | (() => ForegroundColour), backgroundColour: BackgroundColour | (() => BackgroundColour), blink?: boolean): Pen {
		const makePenCell = (char: string | number) => mkCell(resolveValue(foregroundColour), resolveValue(backgroundColour), char, blink);
		const put = (x: number, y: number, char: number | string) => {
			const fg = resolveValue(foregroundColour);
			const bg = resolveValue(backgroundColour);
			this.grid.set(x, y, makePenCell(char));
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
				this.grid.fill(makePenCell(char));
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

	/**
	 * Exports the contents of this view as an EGA-encoded byte sequence.
	 * @returns EGAData object specifying width, height and byte data
	 */
	getBytes(): EGAData {
		const bytes = new Uint8ClampedArray(this.width * this.height * 2);
		
		this.grid.valuePipe
			.toFlatArrayXY()
			.forEach((cell, i) => {
				bytes.set(cellToBytes(cell), i * 2);
			});
		
		return { width: this.width, height: this.height, data: bytes };
	}

	/**
	 * Draws character and attributes from an EGA-encoded byte sequence.
	 * @param source EGAData object specifying width, height and byte data
	 */
	putBytes(source: EGAData): void
	putBytes(source: EGAData, x?: number, y?: number): void
	putBytes(source: EGAData, x: number = 0, y: number = 0) {
		const pipe = Grid.wrapBytes(source).valuePipe.map(bytesToCell);		
		this.grid.paste(pipe, x, y);
	}

	/**
	 * Creates a live EGAText view of an existing byte sequence in EGA standard encoding
	 * 
	 * Writing to the EGAText, or its Grid, directly modifies the byte data, and
	 * changes to the byte data affect subsequent reads of the EGAText.
	 * @param byteData Object specifying width, height and data
	 * @returns Live EGAText view
	 */
	static wrapBytes(byteData: EGAData) {
		if (byteData.data.length !== byteData.width * byteData.height * 2) {
			throw new Error(`Byte length mismatch (expected width x height x 2 (${byteData.width * byteData.height}) bytes, got ${byteData.data.length})`);
		}
		return new EGAText(Grid.wrapBytes(byteData).liveMap(
			bytesToCell,
			cellToBytes
		));
	}

	/**
	 * Exports the screen's contents as a wide string, converting codepage 437 to unicode.
	 * @param lineBreak 
	 * @param blinking If true, characters with the *blink* attribute are replaced with the space (0x20) character
	 * @returns 
	 */
	toString(lineBreak: string = "\n", blinking?: boolean) {
		return this.grid.valuePipe.map(c => blinking && c.blink ? " " : byte437ToWideChar(c.char))
			.rows.map(row => row.join("")).join(lineBreak);
	}

	/**
	 * Exports the screen's contents as an HTML string, converting codepage 437 to unicode.
	 * @param palette The colour palette, as an array of RGBA objects or CSS strings
	 * @param blinkClass CSS class to apply to characters with the *blink* attribute (default: `"ega_blink"`)
	 * @returns 
	 */
	toHTML({palette = egaPalette, lineBreak = "<br>", blinkClass = "ega_blink"}: HTMLOptions) {
		return this.grid.valuePipe.map(c => {
			return `<span${blinkClass} style="background-color: ${
				palette[c.bg] ?? palette[0] ?? black
			}; color: ${
				palette[c.fg] ?? palette[0] ?? black
			}">${byte437ToWideChar(c.char)}</span>`;
		}).rows.map(row => row.join("")).join(lineBreak);
	}

	toANSI(lineBreak = "\n", blinking: boolean = false) {
		return toANSI(this.grid.valuePipe, lineBreak, blinking);
	}

	/**
	 * Creates a rendering context which, when called, paints this EGAText's current contents
	 * to a canvas
	 * @param font The font, as an array of Pipe2D<number>
	 * @param palette The colour palette, as an array of RGBA objects or CSS strings
	 * @returns 
	 */
	createRenderer(font: CrtFont, palette: ArrayLike<RGBA | string> = egaPalette) {
		const cache = new Map<string, OffscreenCanvas>;
		const rgbaPalette = Array.from(palette).map(v => typeof v == "string" ? parseRGBA(v) : v);

		const getTile = (cell: EGATextCell) => {
			// where fg=bg we can share a cache entry
			const char = cell.fg == cell.bg ? 32 : cell.char;
			const cacheKey = `${char},${cell.fg},${cell.bg}`;
			if (cache.has(cacheKey)) return cache.get(cacheKey)!;
			const fgc = rgbaPalette[cell.fg] ?? rgbaPalette[0] ?? black;
			const bgc = rgbaPalette[cell.bg] ?? rgbaPalette[0] ?? black;
			const charPipe = font[char]
				.map(v => v === 0 ? bgc : v === 1 ? fgc : bgc.blend(fgc, v));
			const tile = renderRGBAPipe(charPipe);
			cache.set(cacheKey, tile);
			return tile;
		};

		const blinkPipe = this.grid.valuePipe.map(cell => {
			return cell.blink ? {fg: cell.bg, bg: cell.bg, char: 32} : cell;
		});

		const grid = this.grid;
		const measureTile = font[1];
		const tileWidth = measureTile.width;
		const tileHeight = measureTile.height;
		const buffer = new OffscreenCanvas(
			tileWidth * grid.width,
			tileHeight * grid.height
		);
		const ctx = buffer.getContext("2d")!;
		if (!ctx) throw new Error("Canvas does not support getContext(\"2d\")");

		const bufferState = Grid.solid<OffscreenCanvas | null>(this.width, this.height, null);

		/**
		 * Renders the screen to a new OffscreenCanvas and returns it
		 */
		function rendertoCanvas(): OffscreenCanvas
		/**
		 * Renders the screen to an existing canvas
		 */
		function rendertoCanvas<T extends HTMLCanvasElement | CanvasContainer | OffscreenCanvas>(target: T): T
		function rendertoCanvas(canvasSelector: string): HTMLCanvasElement
		function rendertoCanvas(target?: HTMLCanvasElement | CanvasContainer | OffscreenCanvas | string) {
			let targetCanvas: HTMLCanvasElement | OffscreenCanvas | undefined;
			if (typeof target == "string") {
				const el = document.querySelector(target);
				if (!(el instanceof HTMLCanvasElement)) {
					throw new Error("Selector did not yield a valid render target");
				}
				targetCanvas = el;
			} else if (target !== undefined) {
				targetCanvas = target instanceof HTMLCanvasElement || target instanceof OffscreenCanvas
					? target
					: target.element
			}
			const cellPipe = blinkManager.state ? blinkPipe : grid.valuePipe;
			let requiresFlip = false;
			for (let y = 0; y < grid.height; y++) {
				for (let x = 0; x < grid.width; x++) {
					const currentCell = bufferState.get(x, y);
					const displayCell = cellPipe.get(x, y);
					const tile = getTile(displayCell);
					if (currentCell !== tile) {
						requiresFlip = true;
						const tile = getTile(displayCell);
						ctx.drawImage(tile, x * tileWidth, y * tileHeight);
						bufferState.set(x, y, tile);
					}
				}
			}
			if (targetCanvas) {
				if (requiresFlip) {
					(targetCanvas as HTMLCanvasElement)
						.getContext("2d")!
						.drawImage(buffer, 0, 0, targetCanvas.width, targetCanvas.height);
				}
				return target;
			}

			// copy to a fresh OffscreenCanvas
			const canvas = new OffscreenCanvas(buffer.width, buffer.height);
			canvas.getContext("2d")?.drawImage(buffer, 0, 0);
			return canvas;
		}

		const ref = new WeakRef(rendertoCanvas);
		const unregister = blinkManager.register(() => {
			if (!ref.deref()) unregister();
		});

		return rendertoCanvas;

	}
}

export class CRT<T extends EGAText = EGAText> {
	private pascalCoordinates: boolean;
	private lockScroll: boolean;
	private _cursorX: number = 0;
	private _cursorY: number = 0;
	readonly width: number;
	readonly height: number;
	foreground: ForegroundColour;
	background: BackgroundColour;
	blink: boolean = false;

	constructor(
		readonly screen: T,
		options?: CRTOptions,
		bg: BackgroundColour = 0,
		fg: ForegroundColour = 7
	) {
		this.pascalCoordinates = !!options?.pascalCoordinates
		this.lockScroll = !!options?.lockScroll;
		this.background = bg;
		this.foreground = fg;
		this.width = screen.width;
		this.height = screen.height;
	}

	get cursorX() { return this.pascalCoordinates ? this._cursorX + 1 : this._cursorX; }
	get cursorY() { return this.pascalCoordinates ? this._cursorY + 1 : this._cursorY; }

	private mkCell(char: string | number) {
		return mkCell(this.foreground, this.background, char, this.blink);
	}
	private getPen() {
		return this.screen.pen(this.foreground, this.background, this.blink);
	}

	/**
	 * Sets is CRT context's cursor position
	 * 
	 * If the CRT context was initialised with the `pascalCoordinates` option, the top-left cell is addressed as (1,1), otherwise (0,0).
	 * @param x 
	 * @param y 
	 */
	gotoXY(x: number, y: number) {
		[this._cursorX, this._cursorY] = this.pascalCoordinates ? [x - 1, y - 1] : [x, y];
	}
	/**
	 * Fills the context's work area with space (0x20) characters.
	 */
	clrScr() {
		this.screen.grid.fill({char: 32, fg: this.foreground, bg: this.background, blink: this.blink});
		this._cursorX = 0;
		this._cursorY = 0;
	}
	/**
	 * Writes space (0x20) characters from the cursor's position to the end of the line.
	 */
	clrEol() {
		this.screen.grid.liveRegion(
			this._cursorX,
			this._cursorY,
			this.width - this._cursorX,
			1
		).fill(this.mkCell(32));
	}
	/**
	 * Deletes the line at the cursor, and scrolls the following lines up.
	 */
	delLine() {
		this.screen.grid.liveRegion(
			0,
			this._cursorY,
			this.width,
			this.height - this._cursorY
		).scroll(0, -1, this.mkCell(32));
	}
	/**
	 * Inserts a line of space (0x20) characters at the cursor, scrolling the current and following lines down.
	 */
	insLine() {
		this.screen.grid.liveRegion(
			0,
			this._cursorY,
			this.width,
			this.height - this._cursorY
		).scroll(0, 1, this.mkCell(32));
	}

	/**
	 * Defines a live rectangular subregion
	 * @param x 
	 * @param y 
	 * @param width 
	 * @param height 
	 * @param options 
	 * @returns A live CRT view of a subregion of this screen
	 */
	liveRegion(x: number, y: number, width: number, height: number, options: CRTOptions = {}) {
		return new CRT(this.screen.liveRegion(x, y, width, height), {
			pascalCoordinates: this.pascalCoordinates,
			lockScroll: this.lockScroll,
			...options
		}, this.background, this.foreground);
	}

	/**
	 * Defines a live subregion of this view by specifying a margin.
	 * @param margin 
	 * @returns 
	 */
	liveInset(margin: number = 1) {
		return new CRT(this.screen.liveInset(margin));
	}

	/**
	 * Draws a border around the region represented by this CRT context, using the currently selected colours.
	 * @param lineSet 
	 */
	drawBorder(lineSet: LineSet): void
	drawBorder(horizontalLines: 1 | 2, verticalLines: 1 | 2): void
	drawBorder(setOrHoriz: LineSet | 1 | 2, vert?: 1 | 2): void {
		const set = getLineSet(setOrHoriz, vert);
		this.getPen().drawBorder(set);
	}

	/**
	 * Writes a string at the current cursor position, moving the cursor to the end of the written text.
	 * @param s Text to write
	 */
	write(...s: (string | number)[]) {
		const pen = this.getPen();
		this.screen.grid.batchUpdate(() => {
			[...s.join("")].forEach(char => {
				if (char === "\n") {
					this._cursorY++;
				} else if (char === "\r") {
					this._cursorX = 0;
				} else {
					pen.put(this._cursorX++, this._cursorY, char);
				}
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

	/**
	 * Writes a string at the current cursor position, moving the cursor to the beginning of the next line.
	 * @param s 
	 */
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
