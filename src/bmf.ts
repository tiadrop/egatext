import { Pipe2D } from "@xtia/pipe2d";
import { CrtFont } from "./types";

const isBlock = (charCode: number) => {
    // 192 to 223
    return charCode > 191 && charCode < 224;
}

export function loadBmfFont(data: Uint8Array, addGap?: boolean): CrtFont
export function loadBmfFont(url: string, addGap?: boolean): Promise<CrtFont>
export function loadBmfFont(data: string | Uint8Array, addGap?: boolean): Promise<CrtFont> | CrtFont {

	if (typeof data == "string") {
		return 	fetch(data).then(r => r.status == 200 ? r.bytes() : null).then(bytes => {
			if (!bytes) throw new Error("Failed to fetch font data");
			return loadBmfFont(bytes, addGap)
		});
	}

	if (!data || data.length != 4096) throw new Error("Failed to load font");
	const bytes = [...data];

	const rows = bytes.map(addGap
		? (b, i) => (
				[b&128,b&64,b&32,b&16,b&8,b&4,b&2,b&1,isBlock(Math.floor(i / 16))?b&1:0]
			).map(n => n > 0 ? 1 : 0)
		: b => [b&128,b&64,b&32,b&16,b&8,b&4,b&2,b&1].map(n => n > 0 ? 1 : 0));

	return Array.from({ length: 256 }, (_, i) => Pipe2D.fromRows(rows.slice(i * 16, i * 16 + 16), addGap ? 9 : 8).stash());

}

export function runlengthDecode(values: (number | [number, number])[]) {
	const bytes: number[] = [];
	values.forEach(v => {
		if (Array.isArray(v)) {
			bytes.push(...Array.from({length: v[1]}, () => v[0]));
		} else {
			bytes.push(v);
		}
	});
	return new Uint8Array(bytes);
}