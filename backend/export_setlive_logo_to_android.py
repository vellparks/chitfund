import os
import sqlite3
import base64
from pathlib import Path


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "finance.db")

ANDROID_DRAWABLE_DIR = os.path.join(
    BASE_DIR,
    "..",
    "LicenseGeneratorApp",
    "android",
    "app",
    "src",
    "main",
    "res",
    "drawable",
)


def main() -> None:
  if not os.path.exists(DB_PATH):
    print(f"NO_DB:{DB_PATH}")
    return

  conn = sqlite3.connect(DB_PATH)
  try:
    cur = conn.cursor()
    cur.execute(
        "SELECT logo_base64 FROM system_settings ORDER BY id DESC LIMIT 1"
    )
    row = cur.fetchone()
    if not row or not row[0]:
      print("NO_LOGO")
      return

    b64 = row[0]
    ext = ".png"
    if "," in b64:
      header, b64 = b64.split(",", 1)
      header = header.lower()
      if "jpeg" in header or "jpg" in header:
        ext = ".jpg"
      elif "png" in header:
        ext = ".png"

    try:
      data = base64.b64decode(b64)
    except Exception as exc:  # noqa: BLE001
      print(f"DECODE_ERROR:{exc}")
      return

    out_dir = Path(ANDROID_DRAWABLE_DIR).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    # Clean any old variants
    for old_ext in (".png", ".jpg", ".jpeg"):
      old_path = out_dir / f"setlive_logo{old_ext}"
      if old_path.exists():
        try:
          old_path.unlink()
        except Exception:
          pass

    out_path = out_dir / f"setlive_logo{ext}"
    out_path.write_bytes(data)
    print(f"OK:{out_path}")
  finally:
    conn.close()


if __name__ == "__main__":
  main()
