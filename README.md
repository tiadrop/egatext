# EGAText

A retro display system with a modern API; powered by [Grid](https://github.com/tiadrop/grid).

Emulates EGA text mode through a selection of live view interfaces:

* Grid: all the power of Grid
* Modern: write with `Pen` objects, render to canvas, string or HTML
* Pascal/CRT: independent contexts with an API based on Pascal's CRT unit

## Basic use

`npm install egatext-alpha`

```ts
import { EGAText, vgaFont, drawingChars } from "egatext-alpha";

const screen = EGAText.init(80, 25);

const renderer = screen.getRenderer(vgaFont, /* palette */);

// grid interface
screen.grid.paste(someOtherScreen, 10, 10);
screen.grid.on("change", () => renderer.toCanvas(myCanvas));

// pen interface
screen.pen(14, 0).write(0, 0, "Yellow text!");
screen.pen(11, 0).write(0, 1, "Cyan text!");

// live region view
const region = screen.region(0, 5, 80, 5); // EGAText instance (live)
region.pen(0, 7).drawBorder(drawingChars.line.singleVert.doubleHoriz);

// Pascal-like interface
const crt = region.getCRT({ lockScroll: true });
crt.gotoXY(3, 3);
crt.write("Hello Pascal");
```

