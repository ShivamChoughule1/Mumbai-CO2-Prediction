from pyspark.sql import SparkSession
from pyspark.sql.functions import col, lit, to_timestamp, concat, mean
import sqlite3
import pandas as pd
import glob
import os

def run_spark_pipeline():
    # 1. Initialize Spark
    spark = SparkSession.builder \
        .appName("MumbaiCO2_BigData") \
        .master("local[*]") \
        .getOrCreate()

    print("--- Spark Session Started ---")

    # 2. Load all 24 CSVs from the data folder
    # Note: Ensure files are in ../data/
    try:
        raw_df = spark.read.csv("../data/*.csv", header=True, inferSchema=True)
    except Exception as e:
        print(f"Error: Could not find CSV files in ../data/. {e}")
        return

    # 3. 'Melt' the Wide Format to Long Format
    # We turn the 24 hour columns (00:00:00 to 23:00:00) into rows
    hour_columns = [f"`{i:02d}:00:00`" for i in range(24)]
    stack_string = ", ".join([f"'{c.replace('`','')}', {c}" for c in hour_columns])
    melt_df = raw_df.selectExpr("Date", f"stack(24, {stack_string}) as (Hour, AQI)")

    # 4. Feature Engineering: Derived CO2 Proxy Formula
    # Formula: 415 + (AQI * 0.5)
    melt_df = melt_df.withColumn("co2_level", lit(415) + (col("AQI").cast("float") * 0.5))

    # 5. Create proper Timestamps (Assuming dd-MM-yyyy format in CCR files)
    melt_df = melt_df.withColumn("timestamp", to_timestamp(concat(col("Date"), lit(" "), col("Hour")), "dd-MM-yyyy HH:mm:ss"))

    # 6. Clean Nulls (Forward fill simulation)
    avg_co2 = melt_df.select(mean(col("co2_level"))).collect()[0][0]
    melt_df = melt_df.na.fill({"co2_level": avg_co2})

    # 7. Export to SQLite
    final_pd_df = melt_df.select("timestamp", "co2_level").orderBy("timestamp").toPandas()
    
    conn = sqlite3.connect("../backend/mumbai_co2.db")
    # Initialize schema before writing
    with open("schema.sql", "r") as f:
        conn.executescript(f.read())
        
    final_pd_df.to_sql("historical_data", conn, if_exists="replace", index=False)
    conn.close()
    
    spark.stop()
    print("--- Spark Processing Complete: Database Populated ---")

if __name__ == "__main__":
    run_spark_pipeline()