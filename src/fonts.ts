import { Pipe2D } from "@xtia/pipe2d";
import { CrtFont } from "./types.js";
import { RGBA } from "@xtia/rgba";
import { createImagePipe } from "@xtia/pipe2d-image";

const isRightEdgeDrawing = (charCode: number) => {
	return (charCode >= 176 && charCode <= 178)
		|| (charCode > 191 && charCode < 224)
		|| (charCode == 219);
}

/**
 * Parses BMF font data to the `Pipe2D<number>[]` format used by EGAText.
 * @param data 
 * @param addColumn Add an extra column per EGA's standard (default: true)
 */
export function loadBmfFont(data: Uint8Array, addColumn?: boolean): CrtFont
export function loadBmfFont(url: string, addColumn?: boolean): Promise<CrtFont>
export function loadBmfFont(data: string | Uint8Array, addColumn: boolean = true): Promise<CrtFont> | CrtFont {

	if (typeof data == "string") {
		return fetch(data).then(r => r.status == 200 ? r.bytes() : null).then(bytes => {
			if (!bytes) throw new Error("Failed to fetch font data");
			return loadBmfFont(bytes, addColumn)
		});
	}

	const rowCount = data.length / 256;
	if (!Number.isInteger(rowCount)) throw new Error("Byte length must be a multiple of 256");
	const bytes = [...data];

	const rows = bytes.map(addColumn
		? (b, i) => (
				[b&128,b&64,b&32,b&16,b&8,b&4,b&2,b&1,isRightEdgeDrawing(Math.floor(i / rowCount)) ? b&1 :0]
			).map(n => n > 0 ? 1 : 0)
		: b => [b&128,b&64,b&32,b&16,b&8,b&4,b&2,b&1].map(n => n > 0 ? 1 : 0));

	return Array.from({ length: 256 }, (_, i) => Pipe2D.fromRows(rows.slice(i * rowCount, i * rowCount + rowCount), addColumn ? 9 : 8).stash());

}

export function runlengthDecode(encoded: string) {
	let last = 0;
	const bytes: number[] = [];
	encoded
		.replace(/[A-Z]/g, c => (c+c).toLowerCase())
		.replace(/./g, c => "0123456789abcdef"[c.charCodeAt(0) - 97] ?? c)
		.match(/../g)!.forEach(pair => {
			if (pair[0] == "*") {
				let n = parseInt(pair[1], 16) + 2;
				while (n--) bytes.push(last);
			} else {
				last = parseInt(pair, 16);
				bytes.push(last);
			}
		});
	return new Uint8Array(bytes);
}

const rgbaToNumber = (px: RGBA) => {
	const alpha = px.alphaValue / 255;
	const red = px.redValue / 255;
	return red * alpha;	
};

export function loadSheetFont(url: string, width: number, height: number): Promise<CrtFont>
export function loadSheetFont(imagePipe: Pipe2D<RGBA | number>, width: number, height: number): CrtFont
export function loadSheetFont(pipeOrUrl: string | Pipe2D<RGBA | number>, width: number, height: number) {
	if (typeof pipeOrUrl == "string") {
		return createImagePipe(pipeOrUrl).then(pipe => loadSheetFont(pipe, width, height));
	}
	const pipe = pipeOrUrl.map(r => {
		return typeof r == "number"
			? r
			: rgbaToNumber(r);
	});

	const cw = pipe.width / width;
	const ch = pipe.height / height;
	return Array.from({length: 256}, (_, i) => {
		const x = (i % width) * cw;
		const y = Math.floor(i / width) * ch;
		return pipe.crop(x, y, cw, ch).stash()
	}) as CrtFont;
}