import { LineSet } from "./types.js";

const blockChars = {
	fg25: 176, // ░
	fg50: 177, // ▒
	fg75: 178, // ▓
	fg100: 219, // █
	low: 220, // ▄
	high: 223, // ▀
	left: 221, // ▌
	right: 222, // ▐
}

export const lineSets = {
	singleVert: {
		singleHoriz: {
			corners: {
				topLeft: 218, // ┌
				topRight: 191, // ┐
				bottomLeft: 192, // └
				bottomRight: 217, // ┘
			},
			straight: {
				vert: 179, // │
				horiz: 196, // ─
			},
			cross: 197, // ┼
			junction: {
				up: 193, // ┴
				down: 194, // ┬
				left: 180, // ┤
				right: 195, // ├
			}
		},
		doubleHoriz: {
			corners: {
				topLeft: 213, // ╒
				topRight: 184, // ╕
				bottomLeft: 212, // ╘
				bottomRight: 190, // ╛
			},
			straight: {
				vert: 179, // │
				horiz: 205, // ═
			},
			cross: 216, // ╪
			junction: {
				up: 207, // ╧
				down: 209, // ╤
				left: 181, // ╡
				right: 198, // ╞
			}
		},
	},
	doubleVert: {
		singleHoriz: {
			corners: {
				topLeft: 214, // ╓
				topRight: 183, // ╖
				bottomLeft: 211, // ╙
				bottomRight: 189, // ╜
			},
			straight: {
				vert: 186, // ║
				horiz: 196, // ─
			},
			cross: 215, // ╫
			junction: {
				up: 208, // ╨
				down: 210, // ╥
				left: 182, // ╢
				right: 199, // ╟
			}
		},
		doubleHoriz: {
			corners: {
				topLeft: 201, // ╔
				topRight: 187, // ╗
				bottomLeft: 200, // ╚
				bottomRight: 188, // ╝
			},
			straight: {
				vert: 186, // ║
				horiz: 205, // ═
			},
			cross: 206, // ╬
			junction: {
				up: 202, // ╩
				down: 203, // ╦
				left: 185, // ╣
				right: 204, // ╠
			}
		},
	},
} satisfies {
	[k: string]: {
		[k: string]: LineSet
	}
}

export const drawingChars = {
	block: blockChars,
	line: lineSets
}

export const accentedChars = {
	a: {
		circumflex: 131,
		diaresis: 132,
		grave: 133,
		ring: 134,
		acute: 160,
	},
	A: {
		diareses: 142,
		right: 143,
	},
	c: {
		cedilla: 135,
	},
	C: {
		cedilla: 128,
	},
	e: {
		acute: 130,
		circumflex: 136,
		diareses: 137,
		grave: 138,
	},
	E: {
		acute: 144,
	},
	i: {
		diaresis: 139,
		circumflex: 140,
		grave: 141,
		acute: 161,
	},
	n: {
		tilde: 164,
	},
	N: {
		tilde: 165,
	},
	o: {
		circumflex: 147,
		diareses: 148,
		grave: 149,
		acute: 162,
	},
	O: {
		diaresis: 153,
	},
	u: {
		diaresis: 129,
		circumflex: 150,
		grave: 151,
		acute: 163,
	},
	U: {
		diaresis: 154,
	},
	y: {
		diaresis: 152,
	}
}

export const namedChars = {
	faceOutline: 1,
	faceSolid: 2,
	heart: 3,
	diamond: 4,
	club: 5,
	spade: 6,
	bullet: 7,
	inverseBullet: 8,
	circle: 9,
	male: 11,
	female: 12,
	musicNote: 13,
	musicNotes: 14,
	sun: 15,
	triangleRight: 16,
	triangleLeft: 17,
	rectangle: 22,
	triangleUp: 30,
	triangleDown: 31,
	space: 32,
	arrowVertical: 18,
	doubleExclamation: 19,
	pilcrow: 20,
	section: 21,
	arrowUp: 24,
	arrowDown: 25,
	arrowRight: 26,
	arrowLeft: 27,
	yen: 157,
	angleQuoteLeft: 174,
	angleQuoteRight: 175,
	half: 171,
	quarter: 172,
	invertedQuestion: 168,
	invertedExclamation: 173,
	pound: 156,
	hookedF: 159,
	ae: 145,
	AE: 146,
	alpha: 224,
	szlig: 225,
	pi: 227,
	mu: 230,
	tau: 231,
	Phi: 232,
	phi: 237,
	infinity: 236,
	sigma: 229,
	Sigma: 228,
	Gamma: 226,
	Theta: 233,
	Omega: 234,
	delta: 235,
	epsilon: 238,
	equiv: 240,
	plusMinus: 241,
	gte: 242,
	lte: 243,
	divide: 246,
	approx: 247,
	degree: 248,
	sqrt: 251,
	superN: 252,
	super2: 253,
	square: 254,

}