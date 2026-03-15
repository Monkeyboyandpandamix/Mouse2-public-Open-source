#!/usr/bin/env python3
import argparse
import json
import os
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple


IMAGE_EXTS = {".jpg", ".jpeg", ".tif", ".tiff"}


def to_float(v: Any) -> Optional[float]:
    try:
        if v is None:
            return None
        return float(v)
    except Exception:
        return None


def normalize_lat_lng(lat: Optional[float], lng: Optional[float]) -> Tuple[Optional[float], Optional[float]]:
    if lat is None or lng is None:
        return None, None
    if abs(lat) > 90 or abs(lng) > 180:
        lat = lat / 1e7
        lng = lng / 1e7
    return lat, lng


def list_images(images_dir: str) -> List[str]:
    files: List[str] = []
    for name in sorted(os.listdir(images_dir)):
        path = os.path.join(images_dir, name)
        if not os.path.isfile(path):
            continue
        ext = os.path.splitext(name)[1].lower()
        if ext in IMAGE_EXTS:
            files.append(path)
    files.sort(key=lambda p: os.path.getmtime(p))
    return files


def read_dataflash_points(log_file: str) -> Dict[str, List[Dict[str, Any]]]:
    try:
        from pymavlink import DFReader
    except Exception as e:
        raise RuntimeError(f"pymavlink not available: {e}")

    cam: List[Dict[str, Any]] = []
    gps: List[Dict[str, Any]] = []

    reader = DFReader.DFReader_binary(log_file)
    while True:
        msg = reader.recv_msg()
        if msg is None:
            break
        mtype = msg.get_type()
        d = msg.to_dict()
        if mtype == "CAM":
            lat = to_float(d.get("Lat"))
            lng = to_float(d.get("Lng"))
            alt = to_float(d.get("Alt"))
            lat, lng = normalize_lat_lng(lat, lng)
            if lat is None or lng is None:
                continue
            cam.append(
                {
                    "lat": lat,
                    "lng": lng,
                    "alt": alt,
                    "timeUs": to_float(d.get("TimeUS")),
                }
            )
        elif mtype in {"GPS", "GPS2"}:
            lat = to_float(d.get("Lat"))
            lng = to_float(d.get("Lng"))
            alt = to_float(d.get("Alt"))
            lat, lng = normalize_lat_lng(lat, lng)
            if lat is None or lng is None:
                continue
            gps.append(
                {
                    "lat": lat,
                    "lng": lng,
                    "alt": alt,
                    "timeUs": to_float(d.get("TimeUS")),
                }
            )

    return {"cam": cam, "gps": gps}


def pick_point(points: List[Dict[str, Any]], idx: int, total: int) -> Optional[Dict[str, Any]]:
    if not points:
        return None
    if len(points) == 1:
        return points[0]
    # Map image index proportionally across available points.
    mapped = int(round((idx / max(1, total - 1)) * (len(points) - 1)))
    mapped = max(0, min(len(points) - 1, mapped))
    return points[mapped]


def pick_point_by_time(
    points: List[Dict[str, Any]],
    image_mtime: float,
    first_image_mtime: float,
    time_offset_sec: float,
) -> Optional[Dict[str, Any]]:
    if not points:
        return None
    timed = [p for p in points if p.get("timeUs") is not None]
    if not timed:
        return None
    timed.sort(key=lambda p: float(p.get("timeUs") or 0))
    start_us = float(timed[0].get("timeUs") or 0)
    rel_sec = (image_mtime - first_image_mtime) + time_offset_sec
    target_us = start_us + (rel_sec * 1_000_000.0)
    return min(timed, key=lambda p: abs(float(p.get("timeUs") or 0) - target_us))


def to_dms_rational(deg: float):
    abs_deg = abs(deg)
    d = int(abs_deg)
    m_float = (abs_deg - d) * 60
    m = int(m_float)
    s = round((m_float - m) * 60 * 10000)
    return ((d, 1), (m, 1), (int(s), 10000))


def write_exif_gps(image_path: str, lat: float, lng: float, alt: Optional[float]):
    try:
        import piexif
        from PIL import Image
    except Exception as e:
        raise RuntimeError(f"Pillow/piexif not available: {e}")

    img = Image.open(image_path)
    exif_dict = {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}, "thumbnail": None}
    if "exif" in img.info:
        try:
            exif_dict = piexif.load(img.info["exif"])
        except Exception:
            pass

    lat_ref = "N" if lat >= 0 else "S"
    lng_ref = "E" if lng >= 0 else "W"
    exif_dict["GPS"][piexif.GPSIFD.GPSLatitudeRef] = lat_ref.encode("ascii")
    exif_dict["GPS"][piexif.GPSIFD.GPSLatitude] = to_dms_rational(lat)
    exif_dict["GPS"][piexif.GPSIFD.GPSLongitudeRef] = lng_ref.encode("ascii")
    exif_dict["GPS"][piexif.GPSIFD.GPSLongitude] = to_dms_rational(lng)
    if alt is not None:
        exif_dict["GPS"][piexif.GPSIFD.GPSAltitudeRef] = 0 if alt >= 0 else 1
        exif_dict["GPS"][piexif.GPSIFD.GPSAltitude] = (int(abs(alt) * 100), 100)
    exif_dict["GPS"][piexif.GPSIFD.GPSTimeStamp] = ((0, 1), (0, 1), (0, 1))
    exif_dict["GPS"][piexif.GPSIFD.GPSDateStamp] = datetime.utcnow().strftime("%Y:%m:%d").encode("ascii")

    exif_bytes = piexif.dump(exif_dict)
    img.save(image_path, exif=exif_bytes)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--images-dir", required=True)
    parser.add_argument("--log-file", required=True)
    parser.add_argument("--out-json", required=True)
    parser.add_argument("--write-exif", action="store_true")
    parser.add_argument("--match-mode", choices=["proportional", "time_offset"], default="proportional")
    parser.add_argument("--time-offset-sec", type=float, default=0.0)
    args = parser.parse_args()

    try:
        if not os.path.isdir(args.images_dir):
            raise RuntimeError("images-dir not found")
        if not os.path.isfile(args.log_file):
            raise RuntimeError("log-file not found")

        images = list_images(args.images_dir)
        if not images:
            raise RuntimeError("No images found in images-dir")

        points = read_dataflash_points(args.log_file)
        cam_points = points["cam"]
        gps_points = points["gps"]
        source = "CAM" if cam_points else "GPS"
        selected_points = cam_points if cam_points else gps_points
        if not selected_points:
            raise RuntimeError("No CAM/GPS points found in DataFlash log")

        first_image_mtime = os.path.getmtime(images[0])
        results: List[Dict[str, Any]] = []
        exif_written = 0
        for i, image_path in enumerate(images):
            if args.match_mode == "time_offset":
                point = pick_point_by_time(
                    selected_points,
                    os.path.getmtime(image_path),
                    first_image_mtime,
                    float(args.time_offset_sec),
                )
                if point is None:
                    point = pick_point(selected_points, i, len(images))
            else:
                point = pick_point(selected_points, i, len(images))
            if not point:
                continue
            row = {
                "image": image_path,
                "lat": point["lat"],
                "lng": point["lng"],
                "alt": point.get("alt"),
                "source": source,
                "timeUs": point.get("timeUs"),
            }
            if args.write_exif:
                try:
                    write_exif_gps(image_path, point["lat"], point["lng"], point.get("alt"))
                    row["exifWritten"] = True
                    exif_written += 1
                except Exception as ex:
                    row["exifWritten"] = False
                    row["exifError"] = str(ex)
            results.append(row)

        report = {
            "success": True,
            "imagesDir": args.images_dir,
            "logFile": args.log_file,
            "source": source,
            "imageCount": len(images),
            "pointCount": len(selected_points),
            "matchMode": args.match_mode,
            "timeOffsetSec": float(args.time_offset_sec),
            "geotaggedCount": len(results),
            "exifWrittenCount": exif_written,
            "results": results,
        }
        with open(args.out_json, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
        print(json.dumps(report))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
