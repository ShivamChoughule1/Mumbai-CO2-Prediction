-- =====================================================================
-- Mumbai CO2 Prediction — Database Schema
-- Target engine: SQLite (portable, zero-config)
-- Used by:  big_data_processing/spark_cleaner.py  (writes historical_data)
--           notebooks/arima_research.py          (writes forecasts)
--           backend/main.py                       (reads both tables)
-- =====================================================================

-- ---------------------------------------------------------------------
-- areas
-- Registry of Mumbai localities that forecasts are produced for.
-- Kept small and static; seeded by the ETL / modeling scripts.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS areas (
    area_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    area_name  TEXT    NOT NULL UNIQUE,
    latitude   REAL,
    longitude  REAL
);

-- ---------------------------------------------------------------------
-- historical_data
-- Long-format hourly observations produced by the PySpark cleaner
-- after unpivoting the 24 wide-format CCR CSV files (Jan 2024 – Dec 2025).
-- co2_level is derived from AQI via:  CO2 = 415 + (AQI * 0.5)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historical_data (
    id          INTEGER  PRIMARY KEY AUTOINCREMENT,
    timestamp   DATETIME NOT NULL,
    co2_level   REAL     NOT NULL,
    aqi         REAL,
    area_name   TEXT     DEFAULT 'Mumbai'
);

CREATE INDEX IF NOT EXISTS idx_historical_timestamp
    ON historical_data (timestamp);

CREATE INDEX IF NOT EXISTS idx_historical_area_time
    ON historical_data (area_name, timestamp);

-- ---------------------------------------------------------------------
-- forecasts
-- ARIMA(5,1,5) predictions for Jan–Mar 2026 (and beyond).
-- One row per area per forecast hour, with 95% confidence bounds.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS forecasts (
    id               INTEGER  PRIMARY KEY AUTOINCREMENT,
    area_name        TEXT     NOT NULL,
    forecast_date    DATETIME NOT NULL,
    predicted_value  REAL     NOT NULL,
    lower_ci         REAL,
    upper_ci         REAL,
    model_name       TEXT     DEFAULT 'ARIMA(5,1,5)',
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_forecasts_area_date
    ON forecasts (area_name, forecast_date);

CREATE UNIQUE INDEX IF NOT EXISTS uq_forecasts_area_date
    ON forecasts (area_name, forecast_date);
