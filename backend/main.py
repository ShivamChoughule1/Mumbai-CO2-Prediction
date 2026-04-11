from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
import pandas as pd

app = FastAPI()

# Enable CORS so React can talk to FastAPI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"status": "Mumbai CO2 API Online"}

@app.get("/api/data/{area_name}")
def get_data(area_name: str):
    conn = sqlite3.connect('mumbai_co2.db')
    
    # Get Historical Data
    hist_df = pd.read_sql(f"SELECT timestamp, co2_level FROM historical_data LIMIT 500", conn)
    
    # Get Forecast Data
    fore_df = pd.read_sql(f"SELECT forecast_date, predicted_value FROM forecasts WHERE area_name = '{area_name}'", conn)
    
    conn.close()
    
    return {
        "historical": hist_df.to_dict(orient="records"),
        "forecast": fore_df.to_dict(orient="records")
    }