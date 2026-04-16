import glob
import os
import sqlite3
import pandas as pd
import warnings

warnings.filterwarnings("ignore")

# Define Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "data"))
DB_PATH = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "backend", "mumbai_co2.db"))
SCHEMA_PATH = os.path.join(SCRIPT_DIR, "schema.sql")

def run_pandas_pipeline():
    print(f"Reading workbooks from : {DATA_DIR}")
    print(f"Target database        : {DB_PATH}")
    
    # 1. Load all Excel files
    all_files = glob.glob(os.path.join(DATA_DIR, "*.xlsx"))
    if not all_files:
        print("Error: No .xlsx files found in the data directory!")
        return

    raw_dfs = []
    for file in all_files:
        try:
            df = pd.read_excel(file)
            
            # Extract Year and Month from the filename (e.g., ..._2024_April_...)
            filename = os.path.basename(file)
            parts = filename.split('_')
            year = parts[5]
            month_name = parts[6]
            
            # Create a string mapping for the month
            month_num = pd.to_datetime(month_name, format='%B').month
            
            # Add proper date column based on the 'Date' (day) column in the Excel
            df['FullDate'] = pd.to_datetime(
                dict(year=int(year), month=month_num, day=df['Date'])
            )
            
            raw_dfs.append(df)
            print(f"  [ok]   {filename}  ->  {len(df)} rows")
        except Exception as e:
            print(f"  [fail] {os.path.basename(file)}: {e}")

    # Combine all loaded data
    master_df = pd.concat(raw_dfs, ignore_index=True)
    print(f"Loaded {len(master_df)} raw rows. Unpivoting...")

    # 2. Melt (Unpivot) the 24 hour columns
    # We want to keep 'FullDate', and melt the columns '00:00:00' through '23:00:00'
    hour_cols = [col for col in master_df.columns if ':' in str(col)]
    
    melted_df = pd.melt(
        master_df, 
        id_vars=['FullDate'], 
        value_vars=hour_cols, 
        var_name='Hour', 
        value_name='aqi'
    )

    # 3. Create proper Timestamps
    melted_df['timestamp'] = pd.to_datetime(
        melted_df['FullDate'].astype(str) + ' ' + melted_df['Hour'].astype(str)
    )

    # 4. Feature Engineering: The CO2 Proxy Formula
    # Convert AQI to numeric (coercing errors to NaN), then apply: 415 + (AQI * 0.5)
    melted_df['aqi'] = pd.to_numeric(melted_df['aqi'], errors='coerce')
    melted_df['co2_level'] = 415 + (melted_df['aqi'] * 0.5)

    # 5. Clean Missing Data (Forward fill then Backward fill)
    final_df = melted_df[['timestamp', 'co2_level', 'aqi']].sort_values('timestamp').reset_index(drop=True)
    final_df['co2_level'] = final_df['co2_level'].ffill().bfill()
    final_df['aqi'] = final_df['aqi'].ffill().bfill()
    final_df['area_name'] = 'Mumbai Central'

    # 6. Save to SQLite
    print("Writing to offline database...")
    conn = sqlite3.connect(DB_PATH)
    
    # Initialize Schema
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        conn.executescript(f.read())
        
    conn.execute("DELETE FROM historical_data;")
    conn.commit()
    
    final_df.to_sql("historical_data", conn, if_exists="append", index=False)
    
    total_rows = conn.execute("SELECT COUNT(*) FROM historical_data").fetchone()[0]
    conn.close()
    
    print(f"--- SUCCESS: Wrote {total_rows} hourly records to database! ---")

if __name__ == "__main__":
    run_pandas_pipeline()