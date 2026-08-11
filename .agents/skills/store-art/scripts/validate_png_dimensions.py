#!/usr/bin/env python3.12
"""Validate PNG dimensions without third-party dependencies.

Usage:
  python3.12 validate_png_dimensions.py FILE=WIDTHxHEIGHT [...]
"""

from __future__ import annotations

import struct
import sys
from pathlib import Path

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        header = handle.read(24)
    if len(header) != 24 or header[:8] != PNG_SIGNATURE or header[12:16] != b"IHDR":
        raise ValueError("not a PNG with a valid IHDR header")
    return struct.unpack(">II", header[16:24])


def parse_expectation(argument: str) -> tuple[Path, tuple[int, int]]:
    try:
        filename, raster = argument.rsplit("=", 1)
        width, height = (int(value) for value in raster.lower().split("x", 1))
    except (ValueError, TypeError) as error:
        raise ValueError("expected FILE=WIDTHxHEIGHT") from error
    if not filename or width <= 0 or height <= 0:
        raise ValueError("expected FILE=WIDTHxHEIGHT with positive dimensions")
    return Path(filename), (width, height)


def main(arguments: list[str]) -> int:
    if not arguments:
        print(__doc__.strip(), file=sys.stderr)
        return 2

    failed = False
    for argument in arguments:
        try:
            path, expected = parse_expectation(argument)
            actual = png_dimensions(path)
            if actual != expected:
                print(
                    f"FAIL {path}: {actual[0]}x{actual[1]}, "
                    f"expected {expected[0]}x{expected[1]}",
                    file=sys.stderr,
                )
                failed = True
            else:
                print(f"OK   {path}: {actual[0]}x{actual[1]}")
        except (OSError, ValueError) as error:
            print(f"FAIL {argument}: {error}", file=sys.stderr)
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
