import builtins
import csv
import importlib
import os
import sys


sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


def import_data_saver_without_pandas(monkeypatch):
    original_import = builtins.__import__

    def guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "pandas" or name.startswith("pandas."):
            raise ModuleNotFoundError("No module named 'pandas'")
        return original_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", guarded_import)
    sys.modules.pop("backend.data_saver", None)
    return importlib.import_module("backend.data_saver")


def test_data_saver_reads_history_csv_without_pandas_dependency(tmp_path, monkeypatch):
    data_saver_module = import_data_saver_without_pandas(monkeypatch)
    data_saver = data_saver_module.data_saver

    history_dir = tmp_path / "history"
    history_dir.mkdir()
    csv_path = history_dir / "sensor_data_20260609.csv"

    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["timestamp", "upper_pressure", "lower_pressure"])
        writer.writeheader()
        writer.writerow(
            {
                "timestamp": "2026-06-09 10:00:00.000",
                "upper_pressure": "12.5",
                "lower_pressure": "8.0",
            }
        )

    monkeypatch.setattr(data_saver, "history_dir", str(history_dir))

    rows = data_saver.get_historical_data("upper_pressure", limit=10)

    assert rows == [
        {
            "timestamp": "2026-06-09 10:00:00.000",
            "value": 12.5,
        }
    ]
