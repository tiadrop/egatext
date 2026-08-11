import { Pipe2D } from "@xtia/pipe2d";
import { CrtFont } from "./types.js";

const isLineRight = (charCode: number) => {
    // 192 to 223
    return charCode > 191 && charCode < 224;
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
				[b&128,b&64,b&32,b&16,b&8,b&4,b&2,b&1,isLineRight(Math.floor(i / rowCount)) ? b&1 :0]
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
