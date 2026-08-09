# EGAText

A retro display system with a modern API; powered by [Grid](https://github.com/tiadrop/grid).

Emulates EGA text mode through a selection of live view interfaces:

* Grid: all the power of Grid
* Modern: write with `Pen` objects, render to canvas, string or HTML
* Pascal/CRT: independent contexts with an API based on Pascal's CRT unit

## General use

`npm install egatext-alpha`

```ts
import { EGAText, vgaFont } from "egatext-alpha";

const screen = EGAText.init(80, 25, {
	target: "#my-canvas", // or canvasElement,
	font: vgaFont,
});

// or headless
const headlessScreen = EGAText.init(80, 5);

// grid interface
screen.grid
	.writeMask(screen.grid.map(v => v.bg == 1))
	.paste(someOtherScreen.grid, 10, 10);

// draw a colour chart
screen.grid.paste({
	width: 16,
	height: 8,
	get: (x, y) => ({fg: x, bg: y, char: 254})
}, 10, 4);

// pen interface
screen.pen(14, 0).write(0, 0, "Yellow text!");
screen.pen(11, 0, true).write(0, 1, "Cyan blinking text!");

// live region view
const region = screen.liveRegion(0, 5, 80, 5); // EGAText instance (live)
region.pen(0, 7).drawBorder(1, 2); // single h, double v, ie ╓─╖

// Pascal-like interface
const crt = region.getCRT({ lockScroll: true });
crt.foreground = 13;
crt.write("Hello Pascallllll");
crt.gotoXY(12, 0);
crt.clrEol();
```

## Tips

```ts
// import .BMF fonts
import { loadBmfFont } from "egatext-alpha";

const font = await loadBmfFont("url/to.bmf");
// or font = loadBmfFont(u8aData);
const render = screen.createRenderer(font);

// custom fonts - they're just arrays of Pipe2D<number>
const bigFont = font.map(glyph => glyph.scale(1.5));
const lightMap = imagePipe.map(px => px.lightness);
const pngFont = Array.from(
	{ length: 256 },
	(_, i) => lightMap.crop(i * 32, 0, 32, 32)
);

// render to string
console.log(screen.toString());
// or to HTML
document.body.innerHTML = screen.toHTML({
	blinkClass: "flashing"
});

```
