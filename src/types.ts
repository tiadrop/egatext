import { Pipe2D } from "@xtia/pipe2d";

export type BackgroundColour = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type ForegroundColour = BackgroundColour | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

export type CrtFont = ArrayLike<Pipe2D<number>>;

export type LineSet = {
	readonly corners: {
		readonly topLeft: number | string | (() => number | string);
		readonly topRight: number | string | (() => number | string);
		readonly bottomLeft: number | string | (() => number | string);
		readonly bottomRight: number | string | (() => number | string);
	},
	readonly straight: {
		readonly vert: number | string | (() => number | string);
		readonly horiz: number | string | (() => number | string);
	},
	readonly cross: number | string | (() => number | string);
	readonly junction: {
		readonly up: number | string | (() => number | string);
		readonly down: number | string | (() => number | string);
		readonly left: number | string | (() => number | string);
		readonly right: number | string | (() => number | string);
	}
}

export type CanvasContainer = {element: HTMLCanvasElement};

export type EGAData = {
	readonly width: number;
	readonly height: number;
	readonly data: Uint8ClampedArray;
}
