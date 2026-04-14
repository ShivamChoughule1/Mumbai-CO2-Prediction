# Mumbai CO₂ Prediction

End-to-end Big Data Analytics project that ingests hourly AQI observations for Mumbai (Jan 2024 – Dec 2025), derives CO₂ via the urban proxy formula, forecasts Jan–Mar 2026 with **ARIMA(5, 1, 0)**, and serves the results through a **FastAPI** backend and a **React + Tailwind + Recharts** dashboard.

Built for **Big Data Analytics (BDA)** — KJSCE, Semester 2.

---

## 1. Architecture

```
Raw XLSX (data/)  ──►  PySpark cleaner  ──►  SQLite  ──►  ARIMA model  ──►  SQLite
                      (unpivot + CO₂ formula)      (historical_data)           (forecasts)
                                                                                    │
                                                                                    ▼
                                            React dashboard  ◄──  FastAPI (/api/forecast/{area})
```

CO₂ proxy formula used throughout: **`CO₂ = 415 + (AQI × 0.5)`**

---

## 2. Tech Stack

| Layer | Tools |
|------|-------|
| Big Data | PySpark 3.5 |
| ML / Time-Series | statsmodels (ARIMA), pandas, NumPy, scikit-learn |
| Storage | SQLite (portable, single file) |
| Backend API | FastAPI + Uvicorn |
| Frontend | React 18, Vite, Tailwind CSS 3, Recharts, Axios |
| Palette | Deep Navy `#0a192f`, Electric Blue `#00d4ff` |

---

## 3. Project Structure

```
Mumbai-CO2-Prediction/
├── data/                         # 24 monthly XLSX workbooks (Jan 2024 – Dec 2025)
├── big_data_processing/
│   ├── spark_cleaner.py          # Step 2 — PySpark ETL
│   └── schema.sql                # Step 1 — SQLite schema
├── notebooks/
│   └── arima_research.py         # Step 3 — ARIMA(5,1,0) + forecast
├── backend/
│   ├── main.py                   # Step 4 — FastAPI server
│   ├── database.py
│   └── mumbai_co2.db             # Generated SQLite file
├── frontend/                     # Step 5 — React dashboard
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── package.json
├── requirements.txt              # Step 6
└── README.md
```

All paths inside scripts are **relative** (`../backend/mumbai_co2.db`, `../data`, etc.) — the project runs from a single extracted ZIP.

---

## 4. One-Time Setup

### 4.1 Python environment

```bash
python -m venv venv

# Windows (Git Bash / MINGW)
source venv/Scripts/activate
# Windows (CMD)
venv\Scripts\activate.bat
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
```

### 4.2 Frontend dependencies

```bash
cd frontend
npm install
cd ..
```

### 4.3 Build the database (run once, or whenever data changes)

```bash
# 1. PySpark ETL: unpivot XLSX → historical_data
python big_data_processing/spark_cleaner.py

# 2. Train ARIMA(5,1,0) and populate the forecasts table
python notebooks/arima_research.py
```

After this step, `backend/mumbai_co2.db` will contain both `historical_data` and `forecasts` tables.

---

## 5. Two-Terminal Run Guide

### 🖥️ Terminal 1 — FastAPI backend

```bash
source venv/Scripts/activate      # activate venv (Git Bash on Windows)
cd backend
uvicorn main:app --reload
```

Backend live at **http://127.0.0.1:8000** · docs at **http://127.0.0.1:8000/docs**.

### 🖥️ Terminal 2 — React dashboard

```bash
cd frontend
npm run dev
```

Open the URL Vite prints (usually **http://localhost:5173**).

---

## 6. API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Health check |
| `GET` | `/api/areas` | List of areas with forecasts |
| `GET` | `/api/forecast/{area}` | Combined historical + forecast JSON + peak-next-week summary |

Example: `GET /api/forecast/Bandra`

```json
{
  "summary": {
    "area": "Bandra",
    "history_points": 1000,
    "forecast_points": 2200,
    "peak_next_week": { "forecast_date": "2026-01-03 17:00:00", "predicted_value": 468.12, "lower_ci": 455.7, "upper_ci": 480.5 }
  },
  "historical": [ { "timestamp": "2024-01-01 00:00:00", "co2_level": 479.5 }, ... ],
  "forecast":   [ { "forecast_date": "2026-01-01 00:00:00", "predicted_value": 461.2, "lower_ci": 448.1, "upper_ci": 474.3 }, ... ]
}
```

---

## 7. Dashboard Features

- **Sidebar** — switch between Bandra, Kurla, Colaba, Andheri, Dadar, Mumbai Central.
- **Main chart** — Recharts `LineChart` with historical trend (slate/navy) and 2026 forecast (electric blue).
- **Summary card** — predicted peak CO₂ for the upcoming 7 days + 95 % CI + model label.

---

## 8. Model Notes (ARIMA)

- **Order:** `(p, d, q) = (5, 1, 0)` — 5 autoregressive lags, 1st-order differencing, no moving-average term.
- **Horizon:** 2200 hours ahead (≈ Jan 01 – early Apr 2026).
- **Per-area output:** one city-level ARIMA is fit; per-area forecasts are derived by applying a small multiplicative offset per locality (documented in `notebooks/arima_research.py`) since the source dataset is city-level.

---

## 9. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `JAVA_HOME is not set` | Install JDK 8 / 11 / 17 and set `JAVA_HOME`. |
| `ModuleNotFoundError: openpyxl` | Ensure `pip install -r requirements.txt` was run inside the activated venv. |
| API returns 503 "Database not found" | Run the two scripts in §4.3 before starting uvicorn. |
| Dashboard shows empty chart | Check that `backend/mumbai_co2.db` exists and both `historical_data` and `forecasts` tables are populated. |
| CORS error in browser console | Backend must be running on port 8000; CORS allows all origins in dev. |

---

## 10. Contributors

- **Varun**
- **Shivam Choughule** — https://github.com/ShivamChoughule1

Course: **Big Data Analytics**, KJSCE, Semester 2, Mini-Project.

---

> **Note to reviewers:** The project is fully offline-capable. Once the pipeline has been run once, all historical and forecast data is served from the bundled SQLite file — no external APIs or cloud services are required.
