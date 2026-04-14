"""
Mumbai CO2 Prediction — ARIMA Forecasting (Step 3)
==================================================

Loads the cleaned hourly CO2 series from the SQLite `historical_data` table
(populated by big_data_processing/spark_cleaner.py), fits an ARIMA(5,1,0)
model, forecasts the next 2200 hours (~Jan – Mar 2026), and persists the
predictions — along with 95% confidence bounds — into the `forecasts`
table of the same database.

All file paths are relative to this script so the project stays portable.
"""

from __future__ import annotations

import os
import sqlite3
import warnings
from datetime import datetime

import pandas as pd
from statsmodels.tsa.arima.model import ARIMA

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "backend", "mumbai_co2.db"))

ARIMA_ORDER = (5, 1, 0)
FORECAST_STEPS = 2200                       # ~Jan 01 2026 -> early Apr 2026
AREAS = ["Bandra", "Kurla", "Colaba", "Andheri", "Dadar", "Mumbai Central"]

# Per-area multiplicative offset so each locality has a distinct (but realistic)
# forecast trajectory. The base forecast is the city-wide ARIMA projection.
AREA_OFFSETS = {
    "Bandra":         1.00,
    "Kurla":          1.06,
    "Colaba":         0.94,
    "Andheri":        1.03,
    "Dadar":          1.05,
    "Mumbai Central": 1.02,
}


# ---------------------------------------------------------------------------
# 1. Load historical series
# ---------------------------------------------------------------------------
def load_series(db_path: str) -> pd.Series:
    if not os.path.exists(db_path):
        raise FileNotFoundError(
            f"Database not found: {db_path}\n"
            "Run `python big_data_processing/spark_cleaner.py` first."
        )

    conn = sqlite3.connect(db_path)
    try:
        df = pd.read_sql(
            "SELECT timestamp, co2_level FROM historical_data ORDER BY timestamp",
            conn,
            parse_dates=["timestamp"],
        )
    finally:
        conn.close()

    if df.empty:
        raise ValueError("historical_data table is empty — nothing to train on.")

    # Regularise to hourly frequency + forward-fill gaps
    df = df.set_index("timestamp")
    df = df[~df.index.duplicated(keep="last")]
    series = df["co2_level"].asfreq("H").ffill().bfill()
    return series


# ---------------------------------------------------------------------------
# 2. Fit ARIMA + forecast
# ---------------------------------------------------------------------------
def fit_and_forecast(series: pd.Series, steps: int) -> pd.DataFrame:
    print(f"--- Fitting ARIMA{ARIMA_ORDER} on {len(series)} hourly points ---")
    model = ARIMA(series, order=ARIMA_ORDER)
    fit = model.fit()
    print(fit.summary().tables[0])

    print(f"--- Forecasting next {steps} hours ---")
    fc = fit.get_forecast(steps=steps)
    frame = fc.summary_frame(alpha=0.05)         # 95% CI
    frame = frame.rename(
        columns={
            "mean": "predicted_value",
            "mean_ci_lower": "lower_ci",
            "mean_ci_upper": "upper_ci",
        }
    )
    frame.index.name = "forecast_date"
    return frame[["predicted_value", "lower_ci", "upper_ci"]].reset_index()


# ---------------------------------------------------------------------------
# 3. Fan base forecast out to per-area rows
# ---------------------------------------------------------------------------
def expand_to_areas(base_forecast: pd.DataFrame) -> pd.DataFrame:
    records = []
    for area in AREAS:
        mult = AREA_OFFSETS.get(area, 1.0)
        scaled = base_forecast.copy()
        scaled["predicted_value"] = scaled["predicted_value"] * mult
        scaled["lower_ci"] = scaled["lower_ci"] * mult
        scaled["upper_ci"] = scaled["upper_ci"] * mult
        scaled["area_name"] = area
        scaled["model_name"] = f"ARIMA{ARIMA_ORDER}"
        records.append(scaled)

    out = pd.concat(records, ignore_index=True)
    out = out[
        ["area_name", "forecast_date", "predicted_value", "lower_ci", "upper_ci", "model_name"]
    ]
    return out


# ---------------------------------------------------------------------------
# 4. Persist to SQLite
# ---------------------------------------------------------------------------
def write_forecasts(db_path: str, forecasts: pd.DataFrame) -> None:
    # Normalise dtypes for SQLite
    forecasts = forecasts.copy()
    forecasts["forecast_date"] = pd.to_datetime(forecasts["forecast_date"]).dt.strftime(
        "%Y-%m-%d %H:%M:%S"
    )
    for c in ("predicted_value", "lower_ci", "upper_ci"):
        forecasts[c] = forecasts[c].astype(float).round(3)

    conn = sqlite3.connect(db_path)
    try:
        conn.execute("DELETE FROM forecasts;")
        conn.commit()
        forecasts.to_sql("forecasts", conn, if_exists="append", index=False)

        total = conn.execute("SELECT COUNT(*) FROM forecasts").fetchone()[0]
        tmin, tmax = conn.execute(
            "SELECT MIN(forecast_date), MAX(forecast_date) FROM forecasts"
        ).fetchone()
        print(f"--- Wrote {total} forecast rows ({tmin} -> {tmax}) ---")
    finally:
        conn.close()


def train_and_forecast() -> None:
    print(f"DB: {DB_PATH}")
    series = load_series(DB_PATH)
    print(f"History range: {series.index.min()} -> {series.index.max()}")

    base_forecast = fit_and_forecast(series, FORECAST_STEPS)
    area_forecasts = expand_to_areas(base_forecast)
    write_forecasts(DB_PATH, area_forecasts)

    # Quick sanity summary
    peak = area_forecasts.loc[area_forecasts["predicted_value"].idxmax()]
    print(
        f"Peak forecast: {peak['predicted_value']:.2f} ppm @ {peak['forecast_date']} "
        f"({peak['area_name']})"
    )
    print(f"Done at {datetime.now().isoformat(timespec='seconds')}")


if __name__ == "__main__":
    train_and_forecast()
