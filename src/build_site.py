"""Export the existing Flask dashboard as a standalone GitHub Pages site."""

import argparse
from pathlib import Path

from web_panel import app

ROOT = Path(__file__).resolve().parent.parent


def build_site(output_dir: Path) -> Path:
    # Rendering uses only the local CSV; no campus login or collection is run.
    app.config["TESTING"] = True
    with app.test_client() as client:
        response = client.get("/")
        if response.status_code != 200:
            raise RuntimeError(f"Dashboard rendering failed: HTTP {response.status_code}")
        html = response.get_data(as_text=True)

    output_dir.mkdir(parents=True, exist_ok=True)
    destination = output_dir / "index.html"
    temporary = output_dir / "index.html.tmp"
    temporary.write_text(html, encoding="utf-8")
    temporary.replace(destination)
    (output_dir / ".nojekyll").touch()
    return destination


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=ROOT / "_site",
        help="Directory containing the generated website (default: _site).",
    )
    args = parser.parse_args()
    destination = build_site(args.output_dir)
    print(f"Generated website: {destination}")


if __name__ == "__main__":
    main()
