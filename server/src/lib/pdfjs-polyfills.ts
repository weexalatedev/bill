/**
 * Minimal DOM API stubs that let `pdfjs-dist` (via `pdf-parse`) load in plain
 * Node runtimes where the optional `@napi-rs/canvas` package is unavailable.
 *
 * Why this exists: the legacy pdf.js build (pdfjs-dist 5.x) resolves
 * `@napi-rs/canvas` at module scope to polyfill `DOMMatrix` / `ImageData` /
 * `Path2D`. On hosts that cannot ship its native skia addon (e.g. Vercel's
 * Node functions) that require fails, the globals are never defined, and a
 * later module-scope constant — `const SCALE_MATRIX = new DOMMatrix();` in
 * `legacy/build/pdf.mjs` — throws `ReferenceError: DOMMatrix is not defined`,
 * killing the whole function at import time.
 *
 * Only identity-shaped stubs are provided. Bill intake extracts *text*
 * (`getTextContent`), which never renders, so pdf.js's canvas code is never
 * exercised — at worst it logs "rendering may be broken", which is fine here.
 *
 * Import order matters: this file must be imported BEFORE `pdf-parse` —
 * see `document.ts`, the only module that imports it.
 */

const g = globalThis as typeof globalThis & {
  DOMMatrix?: unknown;
  ImageData?: unknown;
  Path2D?: unknown;
};

if (!g.DOMMatrix) {
  /** 2-D affine matrix; supports the operations pdf.js chains in render paths. */
  class DOMMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;

    constructor(init?: number[]) {
      if (Array.isArray(init) && init.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = [
          init[0], init[1], init[2], init[3], init[4], init[5],
        ];
      }
    }

    private multiplied(other: DOMMatrix): DOMMatrix {
      return new DOMMatrix([
        this.a * other.a + this.c * other.b,
        this.b * other.a + this.d * other.b,
        this.a * other.c + this.c * other.d,
        this.b * other.c + this.d * other.d,
        this.a * other.e + this.c * other.f + this.e,
        this.b * other.e + this.d * other.f + this.f,
      ]);
    }

    private become(m: DOMMatrix): DOMMatrix {
      this.a = m.a; this.b = m.b; this.c = m.c; this.d = m.d; this.e = m.e; this.f = m.f;
      return this;
    }

    translate(x = 0, y = 0): DOMMatrix {
      return this.multiplied(new DOMMatrix([1, 0, 0, 1, x, y]));
    }

    scale(sx = 1, sy = sx): DOMMatrix {
      return this.multiplied(new DOMMatrix([sx, 0, 0, sy, 0, 0]));
    }

    multiply(other: DOMMatrix): DOMMatrix {
      return this.multiplied(other);
    }

    multiplySelf(other: DOMMatrix): DOMMatrix {
      return this.become(this.multiplied(other));
    }

    preMultiplySelf(other: DOMMatrix): DOMMatrix {
      return this.become(other.multiplied(this));
    }

    invertSelf(): DOMMatrix {
      const det = this.a * this.d - this.b * this.c;
      if (det === 0) return this.become(new DOMMatrix());
      const { a, b, c, d, e, f } = this;
      return this.become(new DOMMatrix([
        d / det, -b / det, -c / det, a / det,
        (c * f - d * e) / det, (b * e - a * f) / det,
      ]));
    }

    inverse(): DOMMatrix {
      return new DOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]).invertSelf();
    }
  }
  g.DOMMatrix = DOMMatrix;
}

if (!g.ImageData) {
  class ImageData {
    data: Uint8ClampedArray;
    width: number;
    height: number;

    constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight?: number, height?: number) {
      if (typeof dataOrWidth === 'number') {
        this.width = dataOrWidth;
        this.height = widthOrHeight ?? dataOrWidth;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = dataOrWidth;
        this.width = widthOrHeight ?? 0;
        this.height = height ?? 0;
      }
    }
  }
  g.ImageData = ImageData;
}

if (!g.Path2D) {
  class Path2D {
    constructor(_path?: unknown) { /* never rendered; shape only */ }
    addPath(_path: unknown, _transform?: unknown): void { /* noop */ }
  }
  g.Path2D = Path2D;
}

export {};
