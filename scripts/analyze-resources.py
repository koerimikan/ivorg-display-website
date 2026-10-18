#!/usr/bin/env python3
"""Read-only inventory of resources/ for the IVORG site.

Produces docs/resources/manifest.json. Never writes inside resources/.
Requires Python 3.9+ and Pillow (declared dependency of this script only;
the site's package.json / lockfile are untouched).

  python scripts/analyze-resources.py                # manifest only
  python scripts/analyze-resources.py --crops        # + verification crops
  python scripts/analyze-resources.py --check-hash   # re-hash, compare to manifest

Tasks cover: sha256 + real format sniffing, image geometry / colour mode /
alpha / near-white statistics, ZIP directory + streaming content hash compared
against already-extracted files, and a strictly read-only probe of the four
Affinity containers (thumbnail block + embedded PNG signature scan).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import struct
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESOURCES = ROOT / "resources"
OUT = ROOT / "docs" / "resources" / "manifest.json"
CROPS = ROOT / "previews" / "resource-analysis"
CHUNK = 1 << 20
EXT_ALIASES = {
    ".jpg": "jpeg",
    ".jpeg": "jpeg",
    ".png": "png",
    ".zip": "zip",
    ".af": "affinity-af-v12",
    ".gif": "gif",
    ".pdf": "pdf",
}

MAGIC = [
    (b"\x89PNG\r\n\x1a\n", "png", "\\x89PNG\\r\\n\\x1a\\n"),
    (b"\xff\xd8\xff", "jpeg", "ffd8ff"),
    (b"\x00\xff\x4b\x41\x0c\x00", "affinity-af-v12", "00ff4b410c00 (magic + version 12)"),
    (b"%PDF", "pdf", "25504446"),
    (b"GIF8", "gif", "47494638"),
    (b"RIFF", "riff", "52494646 (WEBP/WAV container)"),
    (b"PK\x03\x04", "zip", "504b0304"),
    (b"PK\x05\x06", "zip-empty", "504b0506"),
    (b"PK\x07\x08", "zip-spanned", "504b0708"),
]


def sha256_file(path: Path) -> tuple[str, int]:
    h, size = hashlib.sha256(), 0
    with path.open("rb") as fh:
        while chunk := fh.read(CHUNK):
            h.update(chunk)
            size += len(chunk)
    return h.hexdigest(), size


def sniff(head: bytes) -> dict:
    for sig, name, readable in MAGIC:
        if head.startswith(sig):
            return {"format": name, "evidence": "magic=" + readable}
    for sig, name, readable in MAGIC:
        if head.find(sig) == 0:
            return {"format": name, "evidence": "magic=" + readable}
    ascii_head = "".join(chr(b) if 32 <= b < 127 else "." for b in head[:16])
    return {"format": "unknown", "evidence": f"no known signature; head ascii={ascii_head!r}"}


def image_facts(path: Path) -> dict:
    from PIL import Image, ImageStat

    facts: dict = {}
    with Image.open(path) as im:
        im.load()
        width, height = im.size
        mode, bands = im.mode, im.getbands()
        facts.update(width=width, height=height, mode=mode, bands=list(bands))
        transparency_key = "transparency" in im.info
        has_alpha_channel = "A" in bands or (mode == "P" and transparency_key)
        facts["hasAlphaChannel"] = has_alpha_channel
        alpha_min = alpha_max = None
        transparent_px = 0
        transparent_px = partial_px = 0
        if has_alpha_channel:
            # "has an alpha channel" and "actually contains transparent pixels"
            # are different claims; report both.
            hist = im.convert("RGBA").getchannel("A").histogram()
            alpha_min = next(i for i, n in enumerate(hist) if n)
            alpha_max = 255 - next(i for i, n in enumerate(reversed(hist)) if n)
            transparent_px = hist[0]
            partial_px = sum(hist[1:255])
        facts.update(
            alphaRange=[alpha_min, alpha_max] if alpha_min is not None else None,
            transparentPixelCount=transparent_px,
            partiallyTransparentPixelCount=partial_px,
        )
        grey = im.convert("L")
        hist = grey.histogram()
        total = width * height
        near_white = sum(hist[250:256])
        facts.update(
            nearWhiteRatio=round(near_white / total, 6),
            luminanceMean=round(ImageStat.Stat(grey).mean[0], 2),
            luminanceStdDev=round(ImageStat.Stat(grey).stddev[0], 2),
        )
        small = im.convert("RGB").resize((64, 64))
        px = list(small.getdata())
        facts["meanColorRGB"] = [
            round(sum(p[i] for p in px) / len(px), 1) for i in range(3)
        ]
        facts["iccProfile"] = bool(im.info.get("icc_profile"))
        facts["dpi"] = list(im.info["dpi"]) if "dpi" in im.info else None
        if "exif" in im.info:
            facts["exifBytes"] = len(im.info["exif"])
            try:
                exif = im.getexif()
                facts["exifTags"] = {
                    str(k): (str(v)[:120] if not isinstance(v, bytes) else f"<{len(v)} bytes>")
                    for k, v in exif.items()
                }
            except Exception as exc:  # pragma: no cover - defensive
                facts["exifError"] = str(exc)
        else:
            facts["exifBytes"] = 0
        facts["blankPageSuspected"] = (
            facts["nearWhiteRatio"] > 0.98 and facts["luminanceStdDev"] < 6
        )
    return facts


def png_header(path: Path, offset: int) -> dict | None:
    """Read IHDR only: enough for geometry without decoding pixels."""
    with path.open("rb") as fh:
        fh.seek(offset)
        head = fh.read(33)
    if not head.startswith(b"\x89PNG\r\n\x1a\n") or head[12:16] != b"IHDR":
        return None
    width, height = struct.unpack_from(">II", head, 16)
    bit_depth, colour_type = head[24], head[25]
    return {
        "offset": offset,
        "width": width,
        "height": height,
        "bitDepth": bit_depth,
        "colourType": colour_type,
    }


def af_probe(path: Path, extract_dir: Path | None) -> dict:
    """Read-only container probe. No layer tree / text extraction is claimed."""
    out: dict = {
        "containerRecognised": False,
        "deepParse": "not_attempted",
        "layerTree": "not_extracted",
        "textNodes": "not_extracted",
        "notes": [],
    }
    with path.open("rb") as fh:
        head = fh.read(4096)
        out["headHex"] = head[:32].hex()
        version = struct.unpack_from("<H", head, 4)[0]
        flags = struct.unpack_from("<H", head, 6)[0]
        class_tag = head[8:12][::-1].decode("latin-1")
        out.update(
            magicOk=head.startswith(b"\x00\xff\x4b\x41"),
            containerVersion=version,
            flags=flags,
            classTag=class_tag,
            infoBlock=head[12:16].decode("latin-1"),
            protocol=(
                int(struct.unpack_from("<I", head, head.find(b"Prot") + 4)[0])
                if b"Prot" in head
                else None
            ),
        )
        out["containerRecognised"] = out["magicOk"] and out["classTag"] == "Prsn"
        if flags:
            out["notes"].append(
                f"flags={flags} is non-zero; the community spec expects 0 for a known layout"
            )
        fat_off, thumb_off = struct.unpack_from("<QQ", head, 16)
        out["fatOffset"] = fat_off
        out["thumbOffset"] = thumb_off
        thumb = None
        if thumb_off:
            fh.seek(thumb_off)
            block = fh.read(32)
            if block[:8] == b"\xff\xff\xff\xffThmb":
                count, block_size = struct.unpack_from("<II", block, 8)
                # 16-byte block header, then a 13-byte sub-header:
                # u32 ?, u32 0, u32 png_size, u8 ?  -> png_size lives at +24,
                # and the PNG itself starts at +29 (not at +16).
                png_size = struct.unpack_from("<I", block, 24)[0]
                thumb = {
                    "count": count,
                    "blockSize": block_size,
                    "pngSize": png_size,
                    "pngOffset": thumb_off + 29,
                    "status": "extracted",
                }
                geometry = png_header(path, thumb_off + 29)
                if geometry:
                    thumb["width"], thumb["height"] = geometry["width"], geometry["height"]
                if extract_dir is not None:
                    fh.seek(thumb_off + 29)
                    png = fh.read(png_size)
                    complete = (
                        png.startswith(b"\x89PNG")
                        and b"IEND" in png[-16:]
                        and len(png) == png_size
                    )
                    if complete:
                        target = extract_dir / f"{path.stem}-thumb.png"
                        target.write_bytes(png)
                        thumb["path"] = str(target.relative_to(ROOT)).replace("\\", "/")
                        thumb["verifiedComplete"] = True
                    else:
                        thumb["status"] = "failed"
                        thumb["detail"] = "thumbnail PNG did not end with IEND at pngSize"
                        out["notes"].append("thumbnail block did not contain a complete PNG")
            else:
                thumb = {"status": "unsupported", "detail": "no Thmb block at thumbOffset"}
        out["thumbnail"] = thumb
        # Cheap secondary probe: how many PNG/JPEG signatures exist in the file.
        fh.seek(0)
        png_hits, jpg_hits, zeros = [], 0, 0
        carry = b""
        offset = 0
        while chunk := fh.read(CHUNK):
            buf = carry + chunk
            i = buf.find(b"\x89PNG\r\n\x1a\n")
            while i != -1 and len(png_hits) < 12:
                png_hits.append(offset - len(carry) + i)
                i = buf.find(b"\x89PNG\r\n\x1a\n", i + 1)
            jpg_hits += buf.count(b"\xff\xd8\xff\xe0")
            zeros += buf.count(b"\x00")
            carry = buf[-8:]
            offset += len(chunk)
        out["embeddedPngOffsets"] = png_hits
        out["embeddedPngs"] = [
            geometry
            for offset in png_hits
            if (geometry := png_header(path, offset)) is not None
        ]
        out["thumbnailFlags"] = {"flagsDecimal": out["flags"], "flagsHex": hex(out["flags"])}
        out["embeddedJpegJfifCount"] = jpg_hits
        out["zeroByteShare"] = round(zeros / path.stat().st_size, 4)
    return out


def zip_facts(path: Path) -> dict:
    entries, unsafe = [], []
    with zipfile.ZipFile(path) as zf:
        for info in zf.infolist():
            name = info.filename
            normalised = name.replace("\\", "/")
            traversal = (
                name.startswith("/")
                or ".." in Path(normalised).parts
                or ":" in normalised.split("/")[0]
            )
            if traversal:
                unsafe.append(name)
            item = {
                "name": name,
                "isDir": info.is_dir(),
                "uncompressedBytes": info.file_size,
                "compressedBytes": info.compress_size,
                "crc32": f"{info.CRC:08x}",
                "compressType": info.compress_type,
                "pathTraversal": traversal,
            }
            if not info.is_dir():
                h = hashlib.sha256()
                read = 0
                with zf.open(info) as fh:
                    while chunk := fh.read(CHUNK):
                        h.update(chunk)
                        read += len(chunk)
                item["sha256"] = h.hexdigest()
                item["bytesRead"] = read
                item["sizeMatchesEntry"] = read == info.file_size
                match, match_sha = None, None
                # Album.zip is authored from inside resources/album, so entry
                # names are relative to that folder, not to resources/.
                for candidate in dict.fromkeys(
                    [normalised, "album/" + normalised, normalised.split("/")[-1], "album/" + normalised.split("/")[-1]]
                ):
                    probe = RESOURCES / candidate
                    if probe.is_file():
                        match = probe
                        break
                if match is not None:
                    match_sha, _ = sha256_file(match)
                    item["extractedPath"] = str(match.relative_to(ROOT)).replace("\\", "/")
                    item["extractedSha256"] = match_sha
                    item["consistentWithExtracted"] = match_sha == item["sha256"]
                    item["status"] = "match" if match_sha == item["sha256"] else "differs"
                else:
                    item["extractedPath"] = None
                    item["status"] = "not-present-on-disk"
            entries.append(item)
    return {
        "entries": entries,
        "pathTraversalAttempts": unsafe,
        "consistentCount": sum(1 for e in entries if e.get("status") == "match"),
        "differingCount": sum(1 for e in entries if e.get("status") == "differs"),
        "notExtractedCount": sum(1 for e in entries if e.get("status") == "not-present-on-disk"),
    }


CROP_REGIONS = [
    ("jacket_1", "credit-block", (100, 1180, 1800, 1640), 1.4),
    ("back_1", "release-footer", (100, 1580, 1700, 1700), 1.6),
    ("jacket_2", "songlist", (2280, 200, 3960, 1720), 1.0),
]


def make_crops() -> list[dict]:
    from PIL import Image

    CROPS.mkdir(parents=True, exist_ok=True)
    made = []
    for stem, label, box, scale in CROP_REGIONS:
        source = RESOURCES / "album" / "preview" / f"{stem}.png"
        if not source.is_file():
            continue
        with Image.open(source) as im:
            crop = im.crop(box)
            if scale != 1:
                crop = crop.resize(
                    (round(crop.width * scale), round(crop.height * scale)),
                    Image.LANCZOS,
                )
            target = CROPS / f"{stem}-{label}.png"
            crop.save(target)
            made.append(
                {
                    "source": str(source.relative_to(ROOT)).replace("\\", "/"),
                    "path": str(target.relative_to(ROOT)).replace("\\", "/"),
                    "box": list(box),
                    "outputSize": list(crop.size),
                }
            )
    return made


def fingerprint(entries: list[dict]) -> str:
    payload = "".join(f"{e['path']}:{e['sha256']}\n" for e in sorted(entries, key=lambda e: e["path"]))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def build(extract: bool) -> dict:
    if not RESOURCES.is_dir():
        sys.exit(f"missing resources directory: {RESOURCES}")
    entries = []
    for path in sorted(RESOURCES.rglob("*")):
        if not path.is_file():
            continue
        rel = str(path.relative_to(ROOT)).replace("\\", "/")
        digest, size = sha256_file(path)
        with path.open("rb") as fh:
            head = fh.read(4096)
        sniffed = sniff(head)
        item = {
            "path": rel,
            "bytes": size,
            "sha256": digest,
            "extension": path.suffix.lower(),
            "format": sniffed["format"],
            "formatEvidence": sniffed["evidence"],
            "extensionMatchesFormat": EXT_ALIASES.get(path.suffix.lower()) == sniffed["format"],
        }
        if sniffed["format"] in {"png", "jpeg"}:
            try:
                item["image"] = image_facts(path)
            except Exception as exc:
                item["image"] = {"error": f"{type(exc).__name__}: {exc}"}
        elif sniffed["format"].startswith("affinity"):
            item["affinity"] = af_probe(path, CROPS if extract else None)
        elif sniffed["format"].startswith("zip"):
            item["zip"] = zip_facts(path)
        entries.append(item)

    images = [e for e in entries if "image" in e and "error" not in e["image"]]
    # Re-hash after the read pass so the "sources untouched" claim is measured,
    # not asserted. Also catches files appearing/vanishing mid-run.
    observed = {e["path"] for e in entries}
    on_disk = {
        str(p.relative_to(ROOT)).replace("\\", "/")
        for p in RESOURCES.rglob("*")
        if p.is_file()
    }
    changed_during_run = [
        e["path"] for e in entries if sha256_file(ROOT / e["path"])[0] != e["sha256"]
    ]
    stability = {
        "rehashMatchesManifest": not changed_during_run,
        "changedDuringRun": changed_during_run,
        "appearedDuringRun": sorted(on_disk - observed),
        "vanishedDuringRun": sorted(observed - on_disk),
    }
    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "generator": "scripts/analyze-resources.py",
        "environment": {
            "python": platform.python_version(),
            "platform": platform.platform(),
            "pillow": __import__("PIL").__version__,
        },
        "scope": {
            "root": "resources",
            "fileCount": len(entries),
            "totalBytes": sum(e["bytes"] for e in entries),
            "images": len(images),
            "affinityFiles": sum(1 for e in entries if "affinity" in e),
            "zipFiles": sum(1 for e in entries if "zip" in e),
            "sourceFilesModifiedDuringRun": not stability["rehashMatchesManifest"]
            or bool(stability["appearedDuringRun"])
            or bool(stability["vanishedDuringRun"]),
        },
        "stability": stability,
        "fingerprint": fingerprint(entries),
        "entries": entries,
        "warnings": [
            w
            for w in [
                *(
                    ["back_2.png is statistically blank (nearWhiteRatio>0.98, stdDev<6); do not delete it without club confirmation"]
                    if any(e["path"].endswith("back_2.png") and e.get("image", {}).get("blankPageSuspected") for e in entries)
                    else []
                ),
                *(
                    ["album.zip is a 350MB+ archive; keep it out of Git"]
                    if any(e.get("bytes", 0) > 100_000_000 and e["path"].endswith(".zip") for e in entries)
                    else []
                ),
            ]
        ],
    }
    if extract:
        manifest["verificationCrops"] = make_crops()
    return manifest


def check_hash(manifest: dict) -> int:
    recorded = {e["path"]: e["sha256"] for e in manifest["entries"]}
    on_disk = {
        str(p.relative_to(ROOT)).replace("\\", "/")
        for p in RESOURCES.rglob("*")
        if p.is_file()
    }
    failures = 0
    for path in sorted(on_disk - set(recorded)):
        print(f"ADDED    {path}")
        failures += 1
    for path in sorted(set(recorded) - on_disk):
        print(f"REMOVED  {path}")
        failures += 1
    current = []
    for path, expected in sorted(recorded.items()):
        if path not in on_disk:
            continue
        digest, _ = sha256_file(ROOT / path)
        current.append({"path": path, "sha256": digest})
        if digest != expected:
            print(f"CHANGED  {path}")
            failures += 1
    if failures:
        return 1
    ok = fingerprint(current) == manifest["fingerprint"]
    print(("UNCHANGED " if ok else "MISMATCH ") + manifest["fingerprint"])
    return 0 if ok else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--crops", action="store_true", help="also write verification crops")
    parser.add_argument("--check-hash", action="store_true", help="verify against existing manifest")
    args = parser.parse_args()

    if args.check_hash:
        if not OUT.is_file():
            sys.exit("no manifest to check")
        return check_hash(json.loads(OUT.read_text(encoding="utf-8")))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    manifest = build(args.crops)
    OUT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    scope = manifest["scope"]
    print(f"files={scope['fileCount']} images={scope['images']} af={scope['affinityFiles']} zip={scope['zipFiles']}")
    print(f"bytes={scope['totalBytes']} fingerprint={manifest['fingerprint']}")
    for entry in manifest["entries"]:
        detail = ""
        if "image" in entry and "error" not in entry["image"]:
            img = entry["image"]
            detail = f"{img['width']}x{img['height']} {img['mode']} alpha={img['hasAlphaChannel']} white={img['nearWhiteRatio']}"
        elif "affinity" in entry:
            af = entry["affinity"]
            thumb = (af.get("thumbnail") or {}).get("status", "none")
            detail = f"v{af['containerVersion']} tags={af['classTag']} thumb={thumb} png_sigs={len(af['embeddedPngOffsets'])}"
        elif "zip" in entry:
            z = entry["zip"]
            detail = f"entries={len(z['entries'])} match={z['consistentCount']} differ={z['differingCount']} absent={z['notExtractedCount']}"
        print(f"  {entry['path']:<44} {entry['format']:<16} {detail}")
    if manifest.get("verificationCrops"):
        for crop in manifest["verificationCrops"]:
            print(f"  crop -> {crop['path']} {crop['outputSize']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
