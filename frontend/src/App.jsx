import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import './App.css';

const API_BASE = 'http://127.0.0.1:8000';
const AREAS = ['Bandra', 'Kurla', 'Colaba', 'Andheri', 'Dadar', 'Borivali', 'Worli', 'Juhu'];

const MAP_COORDS = {
  'Borivali': { top: '15%', left: '40%' },
  'Andheri': { top: '35%', left: '35%' },
  'Juhu': { top: '40%', left: '20%' },
  'Bandra': { top: '50%', left: '25%' },
  'Kurla': { top: '55%', left: '45%' },
  'Worli': { top: '65%', left: '20%' },
  'Dadar': { top: '70%', left: '30%' },
  'Colaba': { top: '90%', left: '25%' }
};

export default function App() {
  const [area, setArea] = useState('Bandra');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPollutants] = useState(['CO2', 'PM2.5']);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    
    axios.get(`${API_BASE}/api/forecast/${encodeURIComponent(area)}`)
      .then((r) => {
        if (!cancelled) setData(r.data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.response?.data?.detail ?? e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [area]);

  const chartData = useMemo(() => {
    if (!data) return [];
    const hist = (data.historical || []).map(d => ({
      time: d.timestamp,
      historical: d.co2_level,
      forecast: null
    }));
    const fore = (data.forecast || []).map(d => ({
      time: d.forecast_date,
      historical: null,
      forecast: d.predicted_value
    }));
    return [...hist, ...fore];
  }, [data]);

  const currentCO2 = data?.historical?.length > 0 
    ? Math.round(data.historical[data.historical.length - 1].co2_level) 
    : 450;
  
  const currentAQI = Math.max(0, Math.round((currentCO2 - 415) / 0.5));

  const getStatus = (val) => {
    if (val < 400) return { label: 'Good', class: 'good', color: 'blue' };
    if (val <= 600) return { label: 'Moderate', class: 'moderate', color: 'yellow' };
    return { label: 'Unhealthy', class: 'unhealthy', color: 'red' };
  };

  return (
    <div className="app">
      <header className="header">
        <div className="search-bar">
          <input type="text" placeholder="Find specific area CO2 and other details..." />
        </div>
        <div className="user-profile">
          <span>MUMBAI AIR QUALITY MONITOR</span>
        </div>
      </header>

      <main className="main-content">
        <div className="control-panel">
          <div className="control-section">
            <label>MUMBAI AREAS</label>
            <select value={area} onChange={(e) => setArea(e.target.value)}>
              {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="control-section">
            <label>SELECT POLLUTANT</label>
            <div className="pollutant-checkboxes">
              {['CO2', 'PM2.5', 'PM10', 'O3', 'SO2'].map(p => (
                <label key={p}>
                  <input type="checkbox" checked={selectedPollutants.includes(p)} readOnly /> {p}
                </label>
              ))}
            </div>
          </div>
          <button className="find-details-btn">FIND DETAILS</button>
        </div>

        <div className="dashboard-grid">
          <div className="map-container">
            <div className="map-placeholder">
              {/* Stylized SVG Map of Mumbai Coastline */}
              <svg className="mumbai-outline" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M40,0 L45,10 L42,25 L35,40 L25,55 L20,70 L22,85 L25,100 L0,100 L0,0 Z" fill="#2c3e50" opacity="0.5" />
              </svg>

              {AREAS.map(a => {
                // For the selected area, use actual data, for others default to blue/good
                const dotColor = (a === area) ? getStatus(currentCO2).color : 'blue';
                return (
                  <div 
                    key={a} 
                    className={`dot ${dotColor} ${area === a ? 'active' : ''}`}
                    style={{ top: MAP_COORDS[a].top, left: MAP_COORDS[a].left }}
                    onClick={() => setArea(a)}
                    title={a}
                  ></div>
                );
              })}
              
              <div className="map-tooltip">
                <p><strong>{area}</strong>: {currentCO2} ppm</p>
              </div>
            </div>

            <div className="co2-legend">
              <h3>CO2 (ppm):</h3>
              <ul>
                <li><span className="dot blue"></span> Good (&lt;400)</li>
                <li><span className="dot yellow"></span> Moderate (400-600)</li>
                <li><span className="dot red"></span> Unhealthy (&gt;600)</li>
              </ul>
            </div>
          </div>

          <div className="right-panel">
            <div className="current-details">
              <h3>CURRENT DETAILS: {area}</h3>
              {loading ? <p className="loading-text">Loading AI Analysis...</p> : (
                <table>
                  <thead>
                    <tr><th>Pollutant</th><th>Value</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>CO2</td>
                      <td className={getStatus(currentCO2).class}>{currentCO2} ppm</td>
                      <td className={getStatus(currentCO2).class}>{getStatus(currentCO2).label}</td>
                    </tr>
                    <tr>
                      <td>AQI</td>
                      <td>{currentAQI}</td>
                      <td>-</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            <div className="breakdown">
                <h3>ARIMA Forecast Model (2026)</h3>
                <div className="chart-container" style={{height: '150px', width: '100%'}}>
                  <ResponsiveContainer>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#444" vertical={false} />
                      <Line type="monotone" dataKey="forecast" stroke="#00d4ff" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
            </div>

            <div className="overall-aqi">
              <h3>Mumbai Overall AQI</h3>
              <div className="aqi-gauge-wrapper">
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie
                      data={[{v:1},{v:1},{v:1}]}
                      innerRadius={55} outerRadius={75}
                      startAngle={180} endAngle={0}
                      dataKey="v" stroke="none"
                    >
                      <Cell fill="#4caf50" /><Cell fill="#ffeb3b" /><Cell fill="#f44336" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="gauge-text">
                  <span className="aqi-val">{currentAQI}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}