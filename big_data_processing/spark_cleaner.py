"""
Mumbai CO2 Prediction — Big Data Cleaner (Step 2)
=================================================

Reads the 24 monthly CCR AQI workbooks from ../data/, unpivots the 24 hour
columns into long-format rows with PySpark, derives CO2 from AQI via the
urban proxy formula  CO2 = 415 + (AQI * 0.5),  builds proper hourly
timestamps, and writes everything into the `historical_data` table of
../backend/mumbai_co2.db.

Notes
-----
* The source files are .xlsx (not .csv), and the workbook's "Date" column
  holds only the day-of-month (1..31) — the month and year are encoded in
  the filename (e.g. ..._2024_January_...). We parse those from the
  filename before handing the data to Spark.
* PySpark cannot read .xlsx natively without an external jar, so we use
  pandas for ingestion and Spark for the distributed transformation step
  (unpivot, feature engineering, cleaning).
* All paths are relative to this script's own location so the project
  remains portable from a single ZIP.
"""

from __future__ import annotations

import glob
import os
import re
import sqlite3
from datetime import datetime

import pandas as pd
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, concat_ws, lit, to_timestamp, when

# ---------------------------------------------------------------------------
# Paths (relative to this script)
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "data"))
DB_PATH = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "backend", "mumbai_co2.db"))
SCHEMA_PATH = os.path.join(SCRIPT_DIR, "schema.sql")

MONTHS = {
    "January": 1, "February": 2, "March": 3, "April": 4,
    "May": 5, "June": 6, "July": 7, "August": 8,
    "September": 9, "October": 10, "November": 11, "December": 12,
}

HOUR_COLS = [f"{h:02d}:00:00" for h in range(24)]


# ---------------------------------------------------------------------------
# 1. Ingest raw workbooks with pandas, tag each row with month/year
# ---------------------------------------------------------------------------
def load_raw_workbooks(data_dir: str) -> pd.DataFrame:
    pattern = os.path.join(data_dir, "*.xlsx")
    files = sorted(glob.glob(pattern))
    if not files:
        raise FileNotFoundError(f"No .xlsx files found in {data_dir}")

    filename_re = re.compile(r"_(\d{4})_([A-Za-z]+)_", re.IGNORECASE)
    frames: list[pd.DataFrame] = []

    for fp in files:
        fname = os.path.basename(fp)
        m = filename_re.search(fname)
        if not m:
            print(f"  [skip] cannot parse year/month from {fname}")
            continue
        year = int(m.group(1))
        month_name = m.group(2).capitalize()
        month = MONTHS.get(month_name)
        if month is None:
            print(f"  [skip] unknown month '{month_name}' in {fname}")
            continue

        df = pd.read_excel(fp)
        df["_year"] = year
        df["_month"] = month
        frames.append(df)
        print(f"  [ok]   {fname}  ->  {len(df)} rows ({year}-{month:02d})")

    combined = pd.concat(frames, ignore_index=True)
    # Keep only the columns we care about (Date + 24 hourly + year/month)
    keep = ["Date", "_year", "_month", *HOUR_COLS]
    missing = [c for c in keep if c not in combined.columns]
    if missing:
        raise ValueError(f"Missing expected columns in source data: {missing}")
    return combined[keep]


# ---------------------------------------------------------------------------
# 2. Spark transformation pipeline
# ---------------------------------------------------------------------------
def transform_with_spark(pdf: pd.DataFrame) -> pd.DataFrame:
    spark = (
        SparkSession.builder.appName("MumbaiCO2_BigData")
        .master("local[*]")
        .config("spark.sql.session.timeZone", "UTC")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")
    print("--- Spark Session Started ---")

    # Cast everything numeric so Spark infers consistent types
    for c in HOUR_COLS:
        pdf[c] = pd.to_numeric(pdf[c], errors="coerce")
    pdf["Date"] = pd.to_numeric(pdf["Date"], errors="coerce").astype("Int64")

    sdf = spark.createDataFrame(pdf)

    # Unpivot the 24 hour columns using stack()
    stack_expr = ", ".join([f"'{h}', `{h}`" for h in HOUR_COLS])
    long_df = sdf.selectExpr(
        "Date",
        "_year",
        "_month",
        f"stack(24, {stack_expr}) as (Hour, AQI)",
    )

    # CO2 proxy formula
    long_df = long_df.withColumn(
        "co2_level",
        lit(415.0) + (col("AQI").cast("double") * lit(0.5)),
    )

    # Build a proper timestamp: year-month-day HH:mm:ss
    long_df = long_df.withColumn(
        "date_str",
        concat_ws(
            "-",
            col("_year").cast("string"),
            when(col("_month") < 10, concat_ws("", lit("0"), col("_month").cast("string")))
            .otherwise(col("_month").cast("string")),
            when(col("Date") < 10, concat_ws("", lit("0"), col("Date").cast("string")))
            .otherwise(col("Date").cast("string")),
        ),
    )
    long_df = long_df.withColumn(
        "timestamp",
        to_timestamp(concat_ws(" ", col("date_str"), col("Hour")), "yyyy-MM-dd HH:mm:ss"),
    )

    # Final projection + ordering
    out = (
        long_df.select(
            col("timestamp"),
            col("co2_level"),
            col("AQI").cast("double").alias("aqi"),
            lit("Mumbai").alias("area_name"),
        )
        .filter(col("timestamp").isNotNull())
        .orderBy("timestamp")
    )

    result_pdf = out.toPandas()
    spark.stop()
    print(f"--- Spark transformation produced {len(result_pdf)} hourly rows ---")
    return result_pdf


# ---------------------------------------------------------------------------
# 3. Persist to SQLite
# ---------------------------------------------------------------------------
def write_to_sqlite(result_pdf: pd.DataFrame, db_path: str, schema_path: str) -> None:
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    # Forward-fill any remaining NaN CO2 values so the ARIMA input is continuous
    result_pdf = result_pdf.sort_values("timestamp").reset_index(drop=True)
    result_pdf["co2_level"] = result_pdf["co2_level"].ffill().bfill()
    result_pdf["aqi"] = result_pdf["aqi"].ffill().bfill()

    conn = sqlite3.connect(db_path)
    try:
        with open(schema_path, "r", encoding="utf-8") as f:
            conn.executescript(f.read())

        # Clean slate for historical_data each run
        conn.execute("DELETE FROM historical_data;")
        conn.commit()

        result_pdf.to_sql("historical_data", conn, if_exists="append", index=False)

        rows = conn.execute("SELECT COUNT(*) FROM historical_data").fetchone()[0]
        tmin, tmax = conn.execute(
            "SELECT MIN(timestamp), MAX(timestamp) FROM historical_data"
        ).fetchone()
        print(f"--- Wrote {rows} rows to historical_data ({tmin} -> {tmax}) ---")
    finally:
        conn.close()


def run_spark_pipeline() -> None:
    print(f"Reading workbooks from : {DATA_DIR}")
    print(f"Target database         : {DB_PATH}")
    raw_pdf = load_raw_workbooks(DATA_DIR)
    print(f"Loaded {len(raw_pdf)} raw (date x hour-cols) rows across all workbooks.")

    result_pdf = transform_with_spark(raw_pdf)
    write_to_sqlite(result_pdf, DB_PATH, SCHEMA_PATH)
    print(f"Done at {datetime.now().isoformat(timespec='seconds')}")


if __name__ == "__main__":
    run_spark_pipeline()
