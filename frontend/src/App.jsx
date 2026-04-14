import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import './App.css'

const API_BASE = 'http://127.0.0.1:8000'
const AREAS = ['Bandra', 'Kurla', 'Colaba', 'Andheri', 'Dadar', 'Mumbai Central']

function formatTs(ts) {
  if (!ts) return ''
  return ts.replace('T', ' ').slice(0, 16)
}

export default function App() {
  const [area, setArea] = useState('Bandra')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    axios
      .get(`${API_BASE}/api/forecast/${encodeURIComponent(area)}`)
      .then((r) => {
        if (!cancelled) setData(r.data)
      })
      .catch((e) => {
        if (!cancelled) setError(e.response?.data?.detail ?? e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [area])

  const chartData = useMemo(() => {
    if (!data) return []
    const hist = (data.historical ?? []).map((h) => ({
      timestamp: h.timestamp,
      historical: h.co2_level,
    }))
    const fc = (data.forecast ?? []).map((f) => ({
      timestamp: f.forecast_date,
      forecast: f.predicted_value,
    }))
    return [...hist, ...fc]
  }, [data])

  const peak = data?.summary?.peak_next_week

  return (
    <div className="min-h-screen flex bg-mumbai-navy text-slate-100">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 p-6 flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold text-electric-blue">Mumbai CO₂</h1>
          <p className="text-xs text-slate-400 mt-1">
            ARIMA(5,1,0) Forecast Dashboard
          </p>
        </div>

        <div>
          <h2 className="text-xs uppercase tracking-wide text-slate-400 mb-2">
            Select Area
          </h2>
          <ul className="space-y-1">
            {AREAS.map((a) => (
              <li key={a}>
                <button
                  onClick={() => setArea(a)}
                  className={`w-full text-left px-3 py-2 rounded transition ${
                    area === a
                      ? 'bg-electric-blue/20 text-electric-blue border border-electric-blue/40'
                      : 'hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  {a}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-auto text-[10px] text-slate-500 leading-relaxed">
          <p>CO₂ derived from AQI via</p>
          <code className="text-electric-blue">CO₂ = 415 + (AQI × 0.5)</code>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 overflow-auto">
        <header className="mb-6 flex items-baseline justify-between">
          <div>
            <h2 className="text-3xl font-semibold text-white">{area}</h2>
            <p className="text-sm text-slate-400">
              Historical (2024–2025) + Forecast (2026)
            </p>
          </div>
          {data && (
            <p className="text-xs text-slate-500">
              {data.summary.history_points} history · {data.summary.forecast_points} forecast
            </p>
          )}
        </header>

        {/* Summary card */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <SummaryCard
            label="Predicted Peak (Next 7 Days)"
            value={peak ? `${peak.predicted_value.toFixed(2)} ppm` : '—'}
            sub={peak ? formatTs(peak.forecast_date) : ''}
            accent
          />
          <SummaryCard
            label="Confidence Band @ Peak"
            value={
              peak
                ? `${peak.lower_ci?.toFixed(1) ?? '—'} – ${peak.upper_ci?.toFixed(1) ?? '—'}`
                : '—'
            }
            sub="95% interval"
          />
          <SummaryCard
            label="Model"
            value="ARIMA(5, 1, 0)"
            sub="Hourly resolution"
          />
        </section>

        {/* Chart */}
        <section className="bg-slate-900/60 border border-slate-800 rounded-lg p-4">
          <h3 className="text-sm uppercase tracking-wide text-slate-400 mb-3">
            CO₂ Time-Series
          </h3>

          {loading && <p className="text-slate-400 text-sm p-8">Loading…</p>}
          {error && (
            <p className="text-red-400 text-sm p-8 whitespace-pre-wrap">{error}</p>
          )}

          {!loading && !error && chartData.length > 0 && (
            <div style={{ width: '100%', height: 420 }}>
              <ResponsiveContainer>
                <LineChart data={chartData}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="timestamp"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickFormatter={(t) => (t ? t.slice(0, 10) : '')}
                    minTickGap={60}
                  />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    domain={['auto', 'auto']}
                    label={{
                      value: 'CO₂ (ppm)',
                      angle: -90,
                      position: 'insideLeft',
                      fill: '#94a3b8',
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#0f172a',
                      border: '1px solid #1e293b',
                      borderRadius: 6,
                      color: '#e2e8f0',
                    }}
                    labelFormatter={(l) => formatTs(l)}
                  />
                  <Legend wrapperStyle={{ color: '#94a3b8' }} />
                  <Line
                    type="monotone"
                    dataKey="historical"
                    name="Historical"
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="forecast"
                    name="2026 Forecast"
                    stroke="#00d4ff"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function SummaryCard({ label, value, sub, accent }) {
  return (
    <div
      className={`rounded-lg p-5 border ${
        accent
          ? 'bg-electric-blue/5 border-electric-blue/40'
          : 'bg-slate-900/60 border-slate-800'
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p
        className={`text-2xl font-semibold mt-1 ${
          accent ? 'text-electric-blue' : 'text-white'
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}
