// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ZIP READER — chiefly its refusals.
//
// This is the one place in the app that opens a file somebody else made, so
// the tests that matter are the ones that prove it says NO: a name that climbs
// out, a name that is absolute, a method it does not implement, a size that
// lies. The happy path is one test; the rest of this file is the boundary.
//
// The archives are built here rather than committed as fixtures, so a hostile
// one can be constructed exactly — a committed binary nobody can read is a
// poor way to state a rule.

import { describe, expect, it } from "vitest";

import { ArchiveError, modEntries, modRoot, readZip } from "../src/mod-archive";
import { type Entry, zip } from "./zip-fixture";

const file = (name: string, text = "x", extra: Partial<Entry> = {}): Entry => ({
  name,
  body: Buffer.from(text, "utf8"),
  ...extra,
});

describe("reading a mod archive", () => {
  it("reads deflated and stored entries back byte for byte", () => {
    const text = "id: my-mod\n".repeat(50);
    const entries = readZip(
      zip([
        file("mod.yaml", text),
        file("preview.png", "PNG", { store: true }),
      ]),
    );
    expect(entries.map((e) => e.name)).toEqual(["mod.yaml", "preview.png"]);
    expect(entries[0]?.data.toString("utf8")).toBe(text);
    expect(entries[1]?.data.toString("utf8")).toBe("PNG");
  });

  it("drops directory entries — the file paths say which folders exist", () => {
    const entries = readZip(zip([file("levels/"), file("levels/a.yaml")]));
    expect(entries.map((e) => e.name)).toEqual(["levels/a.yaml"]);
  });

  it("is not fooled by a zeroed local header, which is legal", () => {
    // The sizes come from the central directory precisely because a writer
    // that emits a data descriptor is allowed to zero them here.
    const archive = zip([file("mod.yaml", "id: my-mod")]);
    archive.writeUInt32LE(0, 18);
    archive.writeUInt32LE(0, 22);
    expect(readZip(archive)[0]?.data.toString("utf8")).toBe("id: my-mod");
  });
});

describe("what it refuses", () => {
  const refuses = (name: string, why: RegExp) => {
    expect(() => readZip(zip([file(name)]))).toThrow(ArchiveError);
    expect(() => readZip(zip([file(name)]))).toThrow(why);
  };

  it("refuses a name that climbs out of the archive", () => {
    refuses("../outside.yaml", /climbs out/);
    refuses("levels/../../outside.yaml", /climbs out/);
  });

  it("refuses an absolute path and a drive letter", () => {
    refuses("/etc/passwd", /absolute/);
    refuses("C:/Windows/system32/x.dll", /drive/);
  });

  it("refuses a backslash, which is a separator on the platform that matters", () => {
    refuses("levels\\a.yaml", /backslash/);
  });

  it("refuses a control character in a path", () => {
    refuses("levels/a\u0000.yaml", /control character/);
  });

  it("refuses a compression method it does not implement", () => {
    expect(() =>
      readZip(zip([file("mod.yaml", "x", { store: true, method: 12 })])),
    ).toThrow(/unsupported compression/);
  });

  it("refuses an entry whose real size is not the size it declared", () => {
    const archive = zip([file("mod.yaml", "id: my-mod")]);
    // The central directory's uncompressed size, made a lie.
    const central = archive.length - 22 - 46 - "mod.yaml".length;
    archive.writeUInt32LE(9_999, central + 24);
    expect(() => readZip(archive)).toThrow(/does not match its declared size/);
  });

  it("refuses a file that is not a zip at all", () => {
    expect(() => readZip(Buffer.from("this is a text file"))).toThrow(
      /not a zip/,
    );
  });
});

describe("finding the mod inside the archive", () => {
  it("takes the root when the manifest is at the top", () => {
    const entries = readZip(zip([file("mod.yaml"), file("levels/a.yaml")]));
    expect(modRoot(entries)).toBe("");
    expect(modEntries(entries).map((e) => e.name)).toEqual([
      "mod.yaml",
      "levels/a.yaml",
    ]);
  });

  it("descends the wrapper folder that compressing a folder creates", () => {
    const entries = readZip(
      zip([file("my-mod/mod.yaml"), file("my-mod/levels/a.yaml")]),
    );
    expect(modRoot(entries)).toBe("my-mod/");
    expect(modEntries(entries).map((e) => e.name)).toEqual([
      "mod.yaml",
      "levels/a.yaml",
    ]);
  });

  it("refuses an archive with no manifest, and one with several", () => {
    expect(() => modRoot(readZip(zip([file("levels/a.yaml")])))).toThrow(
      /no mod.yaml/,
    );
    expect(() =>
      modRoot(readZip(zip([file("one/mod.yaml"), file("two/mod.yaml")]))),
    ).toThrow(/holds 2 mods/);
  });
});
