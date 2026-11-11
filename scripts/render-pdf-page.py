#!/usr/bin/env python3
"""Render page one of a calendar PDF poster to a bounded PNG preview.

This uses a wheel-packaged PDFium renderer rather than the GitHub runner's
Ubuntu apt mirrors. The original PDF attachment is still published unchanged.
"""
import os
import sys
from pathlib import Path


def render(input_path: Path, output_path: Path, max_dimension: int = 1600) -> None:
    import pypdfium2 as pdfium

    # Write atomically: a failed render must not leave a cached partial PNG.
    working = output_path.with_name(output_path.name + ".working.png")
    try:
        with pdfium.PdfDocument(str(input_path)) as document:
            if len(document) < 1:
                raise ValueError("PDF contains no pages")
            page = document[0]
            try:
                width, height = page.get_size()
                if width <= 0 or height <= 0:
                    raise ValueError("Invalid PDF page dimensions")
                bitmap = page.render(scale=max_dimension / max(width, height))
                try:
                    bitmap.to_pil().convert("RGB").save(str(working), format="PNG")
                finally:
                    bitmap.close()
            finally:
                page.close()
        os.replace(working, output_path)
    finally:
        working.unlink(missing_ok=True)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: render-pdf-page.py INPUT.pdf OUTPUT.png", file=sys.stderr)
        sys.exit(2)
    try:
        render(Path(sys.argv[1]), Path(sys.argv[2]))
    except Exception as error:
        print("PDF thumbnail rendering failed: " + str(error), file=sys.stderr)
        sys.exit(1)
