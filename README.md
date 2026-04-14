# Mumbai CO₂ Prediction

An end-to-end Big Data Analytics project that ingests hourly air-quality readings from across Mumbai, cleans them through a PySpark pipeline, forecasts future CO₂ levels with an ARIMA time-series model, and exposes the results through a FastAPI backend and a React dashboard.

This project was built for the **Big Data Analytics (BDA)** course, KJSCE — Semester 2.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Project Structure](#project-structure)
5. [Dataset](#dataset)
6. [Database Schema](#database-schema)
7. [Prerequisites](#prerequisites)
8. [Installation & Setup](#installation--setup)
9. [Running the Project](#running-the-project)
10. [API Reference](#api-reference)
11. [Using the Dashboard](#using-the-dashboard)
12. [Modeling Details](#modeling-details)
13. [Troubleshooting](#troubleshooting)
14. [Contributors](#contributors)

---

## Overview

Mumbai's rapid urbanisation has made air-quality monitoring a critical civic concern. This project demonstrates how **Big Data tooling** (Apache Spark) can be combined with **classical time-series modeling** (ARIMA) and a **modern web stack** (FastAPI + React) to deliver actionable CO₂ forecasts for specific Mumbai neighbourhoods.

**Key capabilities:**

- Batch-cleans two years of hourly AQI data (2024–2025) across 12 monthly Excel files per year using PySpark.
- Trains an ARIMA forecasting model on the cleaned series and writes predictions into a portable SQLite database.
- Serves historical and forecast data through a FastAPI REST endpoint.
- Visualises trends and 7-day forecasts in a responsive React + Tailwind dashboard.

---

## Architecture

```
┌────────────────────┐     ┌────────────────────┐     ┌────────────────────┐
│  Raw Excel Files   │ ──▶ │  PySpark Cleaner   │ ──▶ │  Cleaned CSV /     │
│  (data/ folder)    │     │  spark_cleaner.py  │     │  Staging Data      │
└────────────────────┘     └────────────────────┘     └──────────┬─────────┘
                                                                  │
                                                                  ▼
┌────────────────────┐     ┌────────────────────┐     ┌────────────────────┐
│  React Dashboard   │ ◀── │  FastAPI Backend   │ ◀── │  SQLite Database   │
│  (Vite + Tailwind) │     │  /api/data/{area}  │     │  mumbai_co2.db     │
└────────────────────┘     └────────────────────┘     └──────────▲─────────┘
                                                                  │
                                                       ┌──────────┴─────────┐
                                                       │  ARIMA Forecaster  │
                                                       │ arima_research.py  │
                                                       └────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Big Data Processing | PySpark 3.5.1 |
| Modeling | statsmodels (ARIMA), scikit-learn, NumPy, pandas |
| Storage | SQLite (portable, zero-config) |
| Backend API | FastAPI 0.110 + Uvicorn + SQLAlchemy |
| Frontend | React 19, Vite, Tailwind CSS 4 |
| Language(s) | Python 3.9+, JavaScript (ES2022) |

**Design palette:** Deep Navy `#0a192f` + Electric Blue `#00d4ff` for a clean, technical look.

---

## Project Structure

```
Mumbai-CO2-Prediction/
├── data/                         # Raw hourly AQI Excel files (2024–2025)
├── big_data_processing/
│   ├── spark_cleaner.py          # PySpark ETL: outlier removal, imputation
│   └── schema.sql                # SQLite table definitions
├── notebooks/
│   └── arima_research.py         # ARIMA training + forecast generation
├── backend/
│   ├── main.py                   # FastAPI app (REST endpoints + CORS)
│   ├── database.py               # DB connection helper
│   └── mumbai_co2.db             # Generated SQLite database
├── frontend/
│   ├── src/                      # React components & pages
│   ├── public/
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.js
├── requirements.txt              # Unified Python dependencies
└── README.md
```

---

## Dataset

- **Source files:** `AQI_hourly_city_level_mumbai_<YYYY>_<Month>_mumbai_<Month>_<YYYY>.xlsx`
- **Coverage:** January 2024 – December 2025 (24 monthly workbooks)
- **Granularity:** Hourly pollutant readings at city level
- **Target variable:** CO₂ concentration (`co2_level`)

The raw workbooks live in [data/](data/) and are read directly by the Spark cleaner.

---

## Database Schema

Defined in [big_data_processing/schema.sql](big_data_processing/schema.sql):

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `areas` | Registry of Mumbai localities | `area_id`, `area_name`, `latitude`, `longitude` |
| `historical_data` | Cleaned hourly observations | `timestamp`, `co2_level` |
| `forecasts` | ARIMA predictions per area | `area_name`, `forecast_date`, `predicted_value`, `lower_ci`, `upper_ci` |

---

## Prerequisites

- **Python** 3.9 or newer
- **Node.js** 18 or newer (plus npm)
- **Java 8/11** on `PATH` (required by PySpark)
- ~500 MB free disk space for the virtual environment and dataset

---

## Installation & Setup

Clone the repository and enter the project root:

```bash
git clone https://github.com/ShivamChoughule1/Mumbai-CO2-Prediction.git
cd Mumbai-CO2-Prediction
```

Create and activate a Python virtual environment:

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

Install Python dependencies:

```bash
pip install -r requirements.txt
```

Install frontend dependencies:

```bash
cd frontend
npm install
cd ..
```

---

## Running the Project

The project runs as **three coordinated processes**. Open three terminals at the project root.

### Terminal 1 — Data Pipeline (one-time / on data refresh)

```bash
# 1. Clean raw AQI data with PySpark
python big_data_processing/spark_cleaner.py

# 2. Train ARIMA and persist forecasts into SQLite
python notebooks/arima_research.py
```

This produces `backend/mumbai_co2.db` populated with both `historical_data` and `forecasts`.

### Terminal 2 — Backend API

```bash
cd backend
uvicorn main:app --reload
```

API available at **http://127.0.0.1:8000**. Interactive Swagger docs at **http://127.0.0.1:8000/docs**.

### Terminal 3 — Frontend Dashboard

```bash
cd frontend
npm run dev
```

Dashboard available at **http://localhost:5173**.

---

## API Reference

Defined in [backend/main.py](backend/main.py).

### `GET /`

Health-check endpoint.

**Response**
```json
{ "status": "Mumbai CO2 API Online" }
```

### `GET /api/data/{area_name}`

Returns up to 500 historical observations plus every stored forecast for the given area.

**Path parameters**

| Name | Type | Example |
|------|------|---------|
| `area_name` | string | `Bandra`, `Kurla`, `Colaba` |

**Response**
```json
{
  "historical": [
    { "timestamp": "2024-01-01 00:00:00", "co2_level": 412.5 }
  ],
  "forecast": [
    { "forecast_date": "2026-04-15", "predicted_value": 431.8 }
  ]
}
```

---

## Using the Dashboard

1. **Select an area** from the sidebar (e.g., Bandra, Kurla, Colaba).
2. **Historical View** — inspect cleaned CO₂ trends produced by the Spark pipeline.
3. **Forecast View** — see the next 7 days of ARIMA predictions with confidence intervals.
4. Switch areas at any time; the dashboard refetches from `/api/data/{area_name}`.

---

## Modeling Details

- **Stationarity check:** Augmented Dickey-Fuller (ADF) test drives the differencing parameter *d*.
- **Order selection:** ARIMA(*p*, *d*, *q*) tuned via ACF/PACF inspection and AIC comparison.
- **Forecast horizon:** 7 days (168 hourly steps) with 95 % confidence intervals.
- **Big Data cleansing:** Spark handles outlier removal (IQR bounds) and null imputation (group-mean) so the series fed into ARIMA is continuous and well-formed.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `JAVA_HOME is not set` when running Spark | Install JDK 8 or 11 and export `JAVA_HOME`. |
| `ModuleNotFoundError` after activation | Re-run `pip install -r requirements.txt` inside the activated venv. |
| Frontend shows empty charts | Confirm Terminal 1 finished successfully and `backend/mumbai_co2.db` exists. |
| CORS error in browser console | Backend must be running on port 8000; CORS is open to all origins in [backend/main.py](backend/main.py). |
| `npm run dev` port clash | Vite will auto-pick the next free port — read the terminal output. |

---

## Contributors

- **Varun** — [GitHub](https://github.com/)
- **Shivam Choughule** — [GitHub](https://github.com/ShivamChoughule1)

Course: **Big Data Analytics**, KJSCE, Semester 2.

---

> **Note to reviewers:** The project is fully offline-capable. Once the pipeline has been run once, all historical and forecast data is served from the bundled SQLite file — no external APIs or cloud services are required.
