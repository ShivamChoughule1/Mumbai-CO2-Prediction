import pandas as pd
import sqlite3
from statsmodels.tsa.arima.model import ARIMA
import warnings

warnings.filterwarnings("ignore")

def train_and_forecast():
    # 1. Load Cleaned Data from SQLite
    conn = sqlite3.connect('../backend/mumbai_co2.db')
    df = pd.read_sql("SELECT timestamp, co2_level FROM historical_data", conn, parse_dates=['timestamp'])
    
    # Set index and frequency
    df = df.set_index('timestamp').asfreq('H')
    df['co2_level'] = df['co2_level'].fillna(method='ffill')

    print(f"--- Training ARIMA on {len(df)} data points ---")

    # 2. Fit ARIMA (Order 5,1,0 is standard for hourly urban trends)
    model = ARIMA(df['co2_level'], order=(5, 1, 0))
    model_fit = model.fit()

    # 3. Forecast until March 2026 (Approx 3 months / 2200 hours from Dec 2025)
    forecast_steps = 24 * 90 
    forecast = model_fit.get_forecast(steps=forecast_steps)
    forecast_df = forecast.summary_frame()

    # 4. Prepare for Storage
    forecast_output = forecast_df[['mean', 'mean_ci_lower', 'mean_ci_upper']].reset_index()
    forecast_output.columns = ['forecast_date', 'predicted_value', 'lower_ci', 'upper_ci']
    forecast_output['area_name'] = 'Mumbai Central'

    # 5. Save to forecasts table
    forecast_output.to_sql('forecasts', conn, if_exists='replace', index=False)
    conn.close()
    print("--- ARIMA Forecasting Complete: Saved to SQLite ---")

if __name__ == "__main__":
    train_and_forecast()