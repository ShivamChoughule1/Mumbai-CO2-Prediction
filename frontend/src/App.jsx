import { useEffect, useState } from 'react';
import axios from 'axios';
import './App.css';
import mapImage from './map.jpeg';

const API_BASE = 'http://127.0.0.1:8000';

const POLLUTANTS = [
  { id: 'CO2', label: 'CO2', unit: 'ppm' },
  { id: 'PM2.5', label: 'PM2.5', unit: 'ug/m3' },
  { id: 'PM10', label: 'PM10', unit: 'ug/m3' },
  { id: 'NO2', label: 'NO2', unit: 'ug/m3' },
  { id: 'O3', label: 'O3', unit: 'ug/m3' },
  { id: 'SO2', label: 'SO2', unit: 'ug/m3' },
];

const DEFAULT_SELECTED_POLLUTANTS = ['CO2', 'PM2.5', 'PM10', 'O3', 'SO2'];

const AREA_POSITIONS = {
  Juhu: { top: '27.4%', left: '26.8%' },
  Andheri: { top: '16.6%', left: '42.6%' },
  Bandra: { top: '40.2%', left: '30.3%' },
  Dadar: { top: '49.0%', left: '38.0%' },
  'Mumbai Central': { top: '44.3%', left: '34.8%' },
  Worli: { top: '62.2%', left: '34.1%' },
  Kurla: { top: '40.1%', left: '50.8%' },
  Colaba: { top: '79.3%', left: '30.6%' },
};

const AREA_SEEDS = {
  Worli: { co2: 510, drift: 1.2 },
  Bandra: { co2: 468, drift: 0.8 },
  Dadar: { co2: 526, drift: 1.4 },
  Andheri: { co2: 384, drift: 0.4 },
  Colaba: { co2: 622, drift: 1.7 },
  Kurla: { co2: 452, drift: 1.0 },
  Juhu: { co2: 392, drift: 0.3 },
  'Mumbai Central': { co2: 488, drift: 1.1 },
};

const BASE_AREAS = Object.keys(AREA_POSITIONS);

const STATUS_THRESHOLDS = {
  CO2: [
    { upper: 399, label: 'Good', tone: 'good' },
    { upper: 600, label: 'Moderate', tone: 'moderate' },
    { upper: Infinity, label: 'Unhealthy', tone: 'danger' },
  ],
  'PM2.5': [
    { upper: 30, label: 'Good', tone: 'good' },
    { upper: 60, label: 'Moderate', tone: 'moderate' },
    { upper: Infinity, label: 'Unhealthy', tone: 'danger' },
  ],
  PM10: [
    { upper: 50, label: 'Good', tone: 'good' },
    { upper: 90, label: 'Moderate', tone: 'moderate' },
    { upper: Infinity, label: 'Unhealthy', tone: 'danger' },
  ],
  NO2: [
    { upper: 40, label: 'Good', tone: 'good' },
    { upper: 80, label: 'Moderate', tone: 'moderate' },
    { upper: Infinity, label: 'Unhealthy', tone: 'danger' },
  ],
  O3: [
    { upper: 45, label: 'Good', tone: 'good' },
    { upper: 85, label: 'Moderate', tone: 'moderate' },
    { upper: Infinity, label: 'Unhealthy', tone: 'danger' },
  ],
  SO2: [
    { upper: 25, label: 'Good', tone: 'good' },
    { upper: 60, label: 'Moderate', tone: 'moderate' },
    { upper: Infinity, label: 'Unhealthy', tone: 'danger' },
  ],
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value, precision = 0) {
  const power = 10 ** precision;
  return Math.round(value * power) / power;
}

function getStatus(pollutant, value) {
  const thresholds = STATUS_THRESHOLDS[pollutant] || STATUS_THRESHOLDS.CO2;
  return thresholds.find((entry) => value <= entry.upper) || thresholds[thresholds.length - 1];
}

function getAreaSeed(area, index = 0) {
  return AREA_SEEDS[area] || { co2: 420 + index * 18, drift: 0.6 + index * 0.12 };
}

function buildPollutants(co2, drift) {
  return {
    CO2: round(co2),
    'PM2.5': round(16 + (co2 - 340) / 8 + drift * 4, 1),
    PM10: round(10 + (co2 - 340) / 13 + drift * 3, 1),
    NO2: round(14 + (co2 - 360) / 16 + drift * 2.5, 1),
    O3: round(4 + (co2 - 340) / 28 + drift * 1.8, 1),
    SO2: round(3 + (co2 - 340) / 48 + drift * 1.4, 1),
  };
}

function buildSparkline(base, drift) {
  return Array.from({ length: 10 }, (_, index) =>
    round(base + Math.sin(index * 0.72 + drift) * 18 + (index - 4) * drift * 1.8),
  );
}

function computeAqi(pollutants) {
  const score =
    ((pollutants.CO2 - 350) / 2.8) +
    pollutants['PM2.5'] * 1.6 +
    pollutants.PM10 * 0.8 +
    pollutants.NO2 * 0.5 +
    pollutants.O3 * 0.45 +
    pollutants.SO2 * 0.55;

  return Math.round(clamp(score / 2.6, 35, 240));
}

function createProfile(area, seed, index = 0) {
  const pollutants = buildPollutants(seed.co2, seed.drift);
  const sparkline = buildSparkline(seed.co2, seed.drift + index * 0.15);
  const overallAqi = computeAqi(pollutants);

  return {
    area,
    pollutants,
    sparkline,
    overallAqi,
    status: getStatus('CO2', pollutants.CO2),
  };
}

function buildOfflineProfiles() {
  return BASE_AREAS.reduce((profiles, area, index) => {
    profiles[area] = createProfile(area, getAreaSeed(area, index), index);
    return profiles;
  }, {});
}

function buildProfileFromApi(area, payload, index) {
  const historical = payload?.historical || [];
  const forecast = payload?.forecast || [];
  const latestHistorical = historical[historical.length - 1]?.co2_level;
  const nextPrediction = forecast[0]?.predicted_value;
  const peakPrediction = payload?.summary?.peak_next_week?.predicted_value;
  const baseCo2 = round(nextPrediction ?? peakPrediction ?? latestHistorical ?? getAreaSeed(area, index).co2);
  const seed = getAreaSeed(area, index);
  const pollutants = buildPollutants(baseCo2, seed.drift);
  const sparkline = forecast.slice(0, 10).map((item) => round(item.predicted_value));
  const overallAqi = computeAqi(pollutants);

  return {
    area,
    pollutants,
    sparkline: sparkline.length > 2 ? sparkline : buildSparkline(baseCo2, seed.drift + index * 0.1),
    overallAqi,
    status: getStatus('CO2', pollutants.CO2),
  };
}

function formatPollutantValue(pollutant, value) {
  const config = POLLUTANTS.find((item) => item.id === pollutant);
  if (!config) {
    return String(value);
  }

  const formatted = Number.isInteger(value) ? value : value.toFixed(1);
  return `${formatted} ${config.unit}`;
}

function getComparisonAreas(selectedArea, availableAreas) {
  const preferred = ['Bandra', selectedArea, 'Dadar', 'Kurla', 'Colaba', 'Andheri'];
  return preferred.filter((area, index) => preferred.indexOf(area) === index && availableAreas.includes(area)).slice(0, 3);
}

function getBarMarker(aqi) {
  return `${100 - clamp(aqi / 2.2, 18, 96)}%`;
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16L21 21" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20c1.8-3.6 4.2-5.4 7-5.4s5.2 1.8 7 5.4" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4a4 4 0 0 1 4 4v2.3c0 1.6.5 3.2 1.5 4.5l1 1.2H5.5l1-1.2c1-1.3 1.5-2.9 1.5-4.5V8a4 4 0 0 1 4-4Z" />
      <path d="M10 18a2 2 0 0 0 4 0" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.5 9.2 17 19 7.5" />
    </svg>
  );
}

function GaugeNeedle({ angle }) {
  return (
    <div className="gauge-needle-wrap" style={{ transform: `rotate(${angle}deg)` }}>
      <div className="gauge-needle" />
      <div className="gauge-cap" />
    </div>
  );
}

export default function App() {
  const [availableAreas, setAvailableAreas] = useState(BASE_AREAS);
  const [profiles, setProfiles] = useState(buildOfflineProfiles);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedArea, setSelectedArea] = useState('Worli');
  const [areaMenuOpen, setAreaMenuOpen] = useState(true);
  const [selectedPollutants, setSelectedPollutants] = useState(DEFAULT_SELECTED_POLLUTANTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    async function loadDashboard() {
      setLoading(true);

      try {
        const areaResponse = await axios.get(`${API_BASE}/api/areas`, { timeout: 2400 });
        const backendAreas = Array.isArray(areaResponse.data?.areas) ? areaResponse.data.areas : [];
        const mergedAreas = Array.from(new Set([...BASE_AREAS, ...backendAreas.filter((area) => AREA_POSITIONS[area])]));
        const nextProfiles = { ...buildOfflineProfiles() };

        const results = await Promise.all(
          backendAreas.map(async (area, index) => {
            try {
              const response = await axios.get(`${API_BASE}/api/forecast/${encodeURIComponent(area)}`, {
                timeout: 2400,
              });
              return { area, payload: response.data, index };
            } catch {
              return null;
            }
          }),
        );

        results.forEach((result) => {
          if (!result || !AREA_POSITIONS[result.area]) {
            return;
          }

          nextProfiles[result.area] = buildProfileFromApi(result.area, result.payload, result.index);
        });

        if (!ignore) {
          setProfiles(nextProfiles);
          setAvailableAreas(mergedAreas);
          const fallbackArea = mergedAreas[0] || BASE_AREAS[0];
          setSelectedArea((current) => (mergedAreas.includes(current) ? current : fallbackArea));
        }
      } catch {
        if (!ignore) {
          setProfiles(buildOfflineProfiles());
          setAvailableAreas(BASE_AREAS);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      ignore = true;
    };
  }, []);

  const visiblePollutants = POLLUTANTS.filter((pollutant) => selectedPollutants.includes(pollutant.id));
  const selectedProfile = profiles[selectedArea] || createProfile(selectedArea, getAreaSeed(selectedArea), 0);
  const mapFocus = AREA_POSITIONS[selectedArea] || AREA_POSITIONS.Worli;
  const comparisonAreas = getComparisonAreas(selectedArea, availableAreas);
  const cityWideAreas = availableAreas.filter((area) => AREA_POSITIONS[area]);
  const cityWideAqi = Math.round(
    cityWideAreas.reduce((sum, area) => sum + (profiles[area]?.overallAqi || 0), 0) /
      Math.max(cityWideAreas.length, 1),
  );
  const gaugeAngle = -88 + clamp(cityWideAqi, 0, 240) / 240 * 176;

  function applySelection(nextArea) {
    setSelectedArea(nextArea);
    setSearchTerm(nextArea);
    setAreaMenuOpen(false);
  }

  function handleFindDetails() {
    const exactMatch = availableAreas.find(
      (area) => area.toLowerCase() === searchTerm.trim().toLowerCase(),
    );

    if (exactMatch) {
      applySelection(exactMatch);
      return;
    }

    const partialMatch = availableAreas.find((area) =>
      area.toLowerCase().includes(searchTerm.trim().toLowerCase()),
    );

    if (partialMatch) {
      applySelection(partialMatch);
      return;
    }

    applySelection(selectedArea);
  }

  function togglePollutant(pollutantId) {
    setSelectedPollutants((current) => {
      if (current.includes(pollutantId)) {
        return current.length === 1 ? current : current.filter((item) => item !== pollutantId);
      }

      return [...current, pollutantId];
    });
  }

  return (
    <div className="monitor-page">
      <div className="monitor-shell">
        <div className="dashboard-surface">
          <header className="topbar">
            <label className="top-search" aria-label="Search by area">
              <span className="icon-chip">
                <SearchIcon />
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setAreaMenuOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleFindDetails();
                  }
                }}
                placeholder="Find specific area CO2 and other details..."
              />
            </label>

            <div className="topbar-side">
              <button className="icon-button" type="button" aria-label="User account">
                <UserIcon />
              </button>
              <button className="icon-button" type="button" aria-label="Notifications">
                <BellIcon />
              </button>
              <div className="brand-block">MUMBAI AIR QUALITY MONITOR</div>
            </div>
          </header>

          <main className="dashboard-content" aria-busy={loading}>
            <section className="filters-row">
              <div className="filter-panel area-panel">
                <div className="filter-title">MUMBAI AREAS</div>
                <div className="area-select-label">options to find:</div>
                <div className={`area-select ${areaMenuOpen ? 'open' : ''}`}>
                  <button
                    className="area-select-trigger"
                    type="button"
                    onClick={() => setAreaMenuOpen((open) => !open)}
                  >
                    <span>{selectedArea}</span>
                    <ChevronIcon />
                  </button>

                  {areaMenuOpen ? (
                    <div className="area-select-menu">
                      {availableAreas.length ? (
                        availableAreas.map((area) => (
                          <button
                            key={area}
                            type="button"
                            className={`area-option ${area === selectedArea ? 'active' : ''}`}
                            onClick={() => applySelection(area)}
                          >
                            {area}
                          </button>
                        ))
                      ) : (
                        <div className="area-empty">No matching area</div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="filter-panel pollutant-panel">
                <div className="filter-title">SELECT POLLUTANT</div>
                <div className="pollutant-grid">
                  {POLLUTANTS.map((pollutant) => {
                    const checked = selectedPollutants.includes(pollutant.id);
                    return (
                      <label key={pollutant.id} className="pollutant-toggle">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePollutant(pollutant.id)}
                        />
                        <span className={`tick-box ${checked ? 'checked' : ''}`}>
                          <CheckIcon />
                        </span>
                        <span>{pollutant.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="action-panel">
                <button className="find-button" type="button" onClick={handleFindDetails}>
                  FIND DETAILS
                </button>
              </div>
            </section>

            <section className="dashboard-grid">
              <div className="map-card panel">
                <div className="map-stage">
                  <img className="map-image" src={mapImage} alt="" />

                  <div className="map-focus" style={{ top: mapFocus.top, left: mapFocus.left }}>
                    {selectedArea}: {selectedProfile.pollutants.CO2} ppm
                  </div>

                  {availableAreas.map((area) => {
                    const position = AREA_POSITIONS[area];
                    if (!position) {
                      return null;
                    }

                    const profile = profiles[area] || createProfile(area, getAreaSeed(area), 0);
                    const status = getStatus('CO2', profile.pollutants.CO2);

                    return (
                      <button
                        key={area}
                        type="button"
                        className={`map-pin map-pin--${status.tone} ${selectedArea === area ? 'active' : ''}`}
                        style={{ top: position.top, left: position.left }}
                        onClick={() => {
                          setSearchTerm(area);
                          applySelection(area);
                        }}
                        aria-label={`${area} ${profile.pollutants.CO2} ppm`}
                      >
                        <span className="map-pin-core" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="right-column">
                <section className="panel details-panel">
                  <div className="panel-title">CURRENT DETAILS: {selectedArea.toUpperCase()}</div>

                  <div className="details-table">
                    <div className="details-head">
                      <span>Pollutant</span>
                      <span>Value</span>
                      <span>Status</span>
                    </div>

                    {visiblePollutants.map((pollutant) => {
                      const value = selectedProfile.pollutants[pollutant.id];
                      const status = getStatus(pollutant.id, value);

                      return (
                        <div className="details-row" key={pollutant.id}>
                          <span className="details-name">
                            <i className={`mini-check mini-check--${status.tone}`}>
                              <CheckIcon />
                            </i>
                            {pollutant.label}
                          </span>
                          <span>{formatPollutantValue(pollutant.id, value)}</span>
                          <span className={`status-text status-text--${status.tone}`}>{status.label}</span>
                        </div>
                      );
                    })}

                    {!visiblePollutants.length ? (
                      <div className="details-empty">Select at least one pollutant to display details.</div>
                    ) : null}
                  </div>
                </section>

                <div className="bottom-panels">
                  <section className="panel breakdown-panel">
                    <div className="panel-title">Mumbai Area Air Quality Breakdown (Today)</div>

                    <div className="bar-group">
                      {comparisonAreas.map((area) => {
                        const profile = profiles[area] || createProfile(area, getAreaSeed(area), 0);

                        return (
                          <div className="bar-card" key={area}>
                            <div className="bar-track">
                              <div className="bar-marker" style={{ top: getBarMarker(profile.overallAqi) }} />
                            </div>
                            <div className="bar-label">{area}</div>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section className="panel gauge-panel">
                    <div className="gauge-shell">
                      <div className="gauge-scale">
                        <GaugeNeedle angle={gaugeAngle} />
                      </div>
                      <div className="gauge-caption">
                        <div className="gauge-value">{cityWideAqi}</div>
                        <div>Mumbai Overall AQI</div>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </section>

          </main>
        </div>
      </div>
    </div>
  );
}
