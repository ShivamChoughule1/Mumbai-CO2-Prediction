from fastapi import FastAPI
import sqlite3

app = FastAPI()

@app.get("/")
def home():
    return {"message": "Mumbai CO2 Prediction API is Online"}

@app.get("/forecast/{area_name}")
def get_forecast(area_name: str):
    conn = sqlite3.connect('mumbai_co2.db')
    cursor = conn.cursor()
    # Logic to fetch from your SQLite table
    cursor.execute("SELECT * FROM forecasts WHERE area_name = ?", (area_name,))
    data = cursor.fetchall()
    conn.close()
    return {"area": area_name, "predictions": data}