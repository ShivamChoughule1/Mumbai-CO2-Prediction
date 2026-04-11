CREATE TABLE IF NOT EXISTS areas (
    area_id INTEGER PRIMARY KEY AUTOINCREMENT,
    area_name TEXT NOT NULL UNIQUE,
    latitude REAL,
    longitude REAL
);

CREATE TABLE IF NOT EXISTS historical_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME,
    co2_level REAL
);

CREATE TABLE IF NOT EXISTS forecasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    area_name TEXT,
    forecast_date DATETIME,
    predicted_value REAL,
    lower_ci REAL,
    upper_ci REAL
);