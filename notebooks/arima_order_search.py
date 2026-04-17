"""
Empirical ARIMA order selection for the Mumbai CO2 series.

Runs an Augmented Dickey-Fuller stationarity test and then a grid search
across ARIMA(p, d, q) orders with q >= 2 (per project requirement).
Ranks candidates by AIC; lower is better.

Run:
    python notebooks/arima_order_search.py
"""

from __future__ import annotations

import os
import sqlite3
import warnings

import pandas as pd
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.stattools import adfuller

warnings.filterwarnings("ignore")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.normpath(os.path.join(SCRIPT_DIR, "..", "backend", "mumbai_co2.db"))

# Keep grid small so it completes in minutes on 17k points.
# Professor requirement: q must be > 1, so q in {2, 3, 4, 5}.
P_VALUES = [2, 3, 5]
D_VALUES = [1]              # set via ADF test; kept explicit for the report
Q_VALUES = [2, 3, 4, 5]

# Use a 6-month tail only for fitting to keep the grid tractable;
# final production model is re-fit on the full series in arima_research.py.
FIT_TAIL_HOURS = 24 * 30 * 6   # ~6 months


def load_series() -> pd.Series:
    conn = sqlite3.connect(DB_PATH)
    try:
        df = pd.read_sql(
            "SELECT timestamp, co2_level FROM historical_data ORDER BY timestamp",
            conn,
            parse_dates=["timestamp"],
        )
    finally:
        conn.close()

    df = df.drop_duplicates(subset="timestamp").set_index("timestamp")
    return df["co2_level"].asfreq("H").ffill().bfill()


def adf_report(series: pd.Series) -> int:
    """Run ADF test; return suggested differencing order d."""
    stat, p, *_ = adfuller(series.dropna())
    print(f"ADF (level)  : stat={stat:.3f}  p={p:.4f}  "
          f"{'stationary' if p < 0.05 else 'NOT stationary'}")
    if p < 0.05:
        return 0
    diff = series.diff().dropna()
    stat2, p2, *_ = adfuller(diff)
    print(f"ADF (1st diff): stat={stat2:.3f}  p={p2:.4f}  "
          f"{'stationary' if p2 < 0.05 else 'NOT stationary'}")
    return 1 if p2 < 0.05 else 2


def grid_search(series: pd.Series):
    results = []
    total = len(P_VALUES) * len(D_VALUES) * len(Q_VALUES)
    i = 0
    for p in P_VALUES:
        for d in D_VALUES:
            for q in Q_VALUES:
                i += 1
                try:
                    fit = ARIMA(series, order=(p, d, q)).fit()
                    results.append(
                        {"order": (p, d, q), "aic": fit.aic, "bic": fit.bic,
                         "loglik": fit.llf}
                    )
                    print(f"[{i:>2}/{total}]  ARIMA{(p, d, q)}  "
                          f"AIC={fit.aic:,.1f}  BIC={fit.bic:,.1f}")
                except Exception as exc:
                    print(f"[{i:>2}/{total}]  ARIMA{(p, d, q)}  FAILED: {exc}")
    return pd.DataFrame(results).sort_values("aic").reset_index(drop=True)


def main() -> None:
    series = load_series()
    print(f"Series length: {len(series)} hourly points "
          f"({series.index.min()} -> {series.index.max()})")

    d_suggested = adf_report(series)
    print(f"Suggested d from ADF: {d_suggested}")

    tail = series.tail(FIT_TAIL_HOURS)
    print(f"Fitting grid on last {len(tail)} hours for speed.\n")

    table = grid_search(tail)
    print("\n========= Ranked by AIC (lower = better) =========")
    print(table.to_string(index=False))
    best = table.iloc[0]
    print(f"\nBest order: ARIMA{best['order']}  "
          f"(AIC={best['aic']:,.1f}, BIC={best['bic']:,.1f})")


if __name__ == "__main__":
    main()
