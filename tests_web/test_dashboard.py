import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
from web_panel import app, prepare_dashboard
import web_panel
from build_site import build_site


class DashboardTests(unittest.TestCase):
    def test_increases_do_not_count_as_consumption(self):
        frame = pd.DataFrame({
            "time": ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"],
            "num": [100, 90, 200, 190],
        })
        dashboard = prepare_dashboard(frame)
        self.assertEqual(dashboard["average"], 6.67)
        self.assertEqual(dashboard["estimated_days"], 28.5)
        self.assertEqual([row["change"] for row in dashboard["records"]], [None, -10, 110, -10])

    def test_sorting_duplicates_invalid_values_and_timezone(self):
        frame = pd.DataFrame({
            "time": ["2026-10-03 15:00", "2026-10-02 15:00", "bad", "2026-10-03 15:00", "2026-10-01 15:00"],
            "num": [82, 90, 70, 80, float("inf")],
        })
        dashboard = prepare_dashboard(frame)
        self.assertEqual(dashboard["count"], 2)
        self.assertEqual(dashboard["balance"], 80)
        self.assertEqual(dashboard["latest_change"], -10)
        self.assertTrue(dashboard["latest_iso"].endswith("+08:00"))
        self.assertEqual(dashboard["average"], 10)

    def test_sparse_empty_and_zero_consumption(self):
        empty = prepare_dashboard(pd.DataFrame(columns=["time", "num"]))
        self.assertIsNone(empty["balance"])
        self.assertEqual(empty["records"], [])
        sparse = prepare_dashboard(pd.DataFrame({"time": ["2026-10-03 10:00", "2026-10-03 11:00"], "num": [100, 90]}))
        self.assertIsNone(sparse["average"])
        zero = prepare_dashboard(pd.DataFrame({"time": ["2026-10-01", "2026-10-02"], "num": [100, 100]}))
        self.assertEqual(zero["average"], 0)
        self.assertIsNone(zero["estimated_days"])

    def test_average_only_uses_recent_window(self):
        frame = pd.DataFrame({"time": ["2026-09-01", "2026-10-01", "2026-10-02"], "num": [1000, 100, 90]})
        self.assertEqual(prepare_dashboard(frame)["average"], 10)

    def test_missing_columns_fail(self):
        with self.assertRaises(ValueError):
            prepare_dashboard(pd.DataFrame({"balance": [100]}))

    def test_static_export_has_assets_download_and_safe_empty_state(self):
        with tempfile.TemporaryDirectory() as directory:
            csv = Path(directory) / "data.csv"
            csv.write_text("time,num,unit\n", encoding="utf-8")
            original = web_panel.CSV_PATH
            web_panel.CSV_PATH = csv
            try:
                output = Path(directory) / "site"
                page = build_site(output)
                html = page.read_text()
                self.assertIn("还没有电量记录", html)
                self.assertNotIn("nan", html)
                self.assertIn("./static/dashboard.js", html)
                self.assertIn('id="recharge-amount"', html)
                self.assertIn('id="recharge-days"', html)
                self.assertNotIn('id="records"', html)
                self.assertTrue((output / "static/dashboard.css").is_file())
                self.assertEqual((output / "electricity_data.csv").read_text(), csv.read_text())
                with app.test_client() as client:
                    response = client.get("/electricity_data.csv")
                    self.assertEqual(response.status_code, 200)
                    response.close()
            finally:
                web_panel.CSV_PATH = original


if __name__ == "__main__":
    unittest.main()
