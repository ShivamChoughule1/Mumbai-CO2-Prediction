"""
Mumbai CO2 Prediction — FastAPI Backend (Step 4)
================================================
Serves historical hourly CO2 observations and ARIMA forecasts from the
portable SQLite database at ../backend/mumbai_co2.db.

Endpoints
---------
GET  /                       -> health check
GET  /api/areas              -> list of areas that have forecasts
GET  /api/forecast/{area}    -> combined historical + forecast JSON
"""

from __future__ import annotations

import os
import sqlite3
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

# ---------------------------------------------------------------------------
# Paths (relative — keeps the project portable from a single ZIP)
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(SCRIPT_DIR, "mumbai_co2.db")

DEFAULT_AREAS = ["Bandra", "Kurla", "Colaba", "Andheri", "Dadar", "Mumbai Central"]

app = FastAPI(title="Mumbai CO2 Prediction API", version="1.0.0")

# CORS — React dev server runs on 5173 by default; allow all during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_conn() -> sqlite3.Connection:
    if not os.path.exists(DB_PATH):
        raise HTTPException(
            status_code=503,
            detail=(
                "Database not found. Run the Spark cleaner and ARIMA script first:\n"
                "  python big_data_processing/spark_cleaner.py\n"
                "  python notebooks/arima_research.py"
            ),
        )
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/")
def home() -> dict[str, str]:
    return {"status": "Mumbai CO2 API Online"}


@app.get("/api/areas")
def list_areas() -> dict[str, Any]:
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT DISTINCT area_name FROM forecasts ORDER BY area_name"
        ).fetchall()
    finally:
        conn.close()
    areas = [r["area_name"] for r in rows] or DEFAULT_AREAS
    return {"areas": areas}


@app.get("/api/forecast/{area}")
def get_forecast(
    area: str,
    hist_limit: int = Query(1000, ge=50, le=20000, description="Max historical rows"),
) -> dict[str, Any]:
    """Return combined JSON: historical observations + ARIMA forecast."""
    conn = get_conn()
    try:
        # 1. Historical (city-level; ordered newest-first then reversed for charting)
        hist_rows = conn.execute(
            """
            SELECT timestamp, co2_level
            FROM historical_data
            ORDER BY timestamp DESC
            LIMIT ?
            """,
            (hist_limit,),
        ).fetchall()
        historical = [
            {"timestamp": r["timestamp"], "co2_level": round(r["co2_level"], 2)}
            for r in reversed(hist_rows)
        ]

        # 2. Forecast for the requested area
        fc_rows = conn.execute(
            """
            SELECT forecast_date, predicted_value, lower_ci, upper_ci
            FROM forecasts
            WHERE area_name = ?
            ORDER BY forecast_date
            """,
            (area,),
        ).fetchall()

        if not fc_rows:
            raise HTTPException(
                status_code=404,
                detail=f"No forecast found for area '{area}'.",
            )

        forecast = [
            {
                "forecast_date": r["forecast_date"],
                "predicted_value": round(r["predicted_value"], 2),
                "lower_ci": round(r["lower_ci"], 2) if r["lower_ci"] is not None else None,
                "upper_ci": round(r["upper_ci"], 2) if r["upper_ci"] is not None else None,
            }
            for r in fc_rows
        ]

        # 3. Summary — peak predicted CO2 in the next 7 days (168 hours)
        next_week = forecast[:168]
        peak = max(next_week, key=lambda x: x["predicted_value"]) if next_week else None
        summary = {
            "area": area,
            "history_points": len(historical),
            "forecast_points": len(forecast),
            "peak_next_week": peak,
        }
    finally:
        conn.close()

    return {"summary": summary, "historical": historical, "forecast": forecast}
