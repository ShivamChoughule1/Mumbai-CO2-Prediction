import { useEffect, useState } from 'react';
import axios from 'axios';
import './App.css';

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
  Juhu: { top: '30.9%', left: '13.9%' },
  Andheri: { top: '34.1%', left: '22.1%' },
  Bandra: { top: '55.1%', left: '16.9%' },
  Dadar: { top: '60.2%', left: '20.8%' },
  'Mumbai Central': { top: '67.4%', left: '18.9%' },
  Worli: { top: '85.6%', left: '17.1%' },
  Kurla: { top: '57.2%', left: '40.9%' },
  Colaba: { top: '93.0%', left: '14.4%' },
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

function OfflineMapArt() {
  return (
    <svg className="map-art" viewBox="0 0 760 700" aria-hidden="true">
      <defs>
        <linearGradient id="seaGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4689aa" />
          <stop offset="58%" stopColor="#2e7693" />
          <stop offset="100%" stopColor="#235a74" />
        </linearGradient>
        <linearGradient id="westLandGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e8edf2" />
          <stop offset="100%" stopColor="#d0d8df" />
        </linearGradient>
        <linearGradient id="eastLandGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#dce3ea" />
          <stop offset="100%" stopColor="#cdd5de" />
        </linearGradient>
      </defs>

      <rect width="760" height="700" rx="18" fill="url(#seaGradient)" />

      <path
        d="M271 155c33 35 63 79 90 131 25 49 47 101 67 156 21 57 40 122 47 191H420c-10-62-27-118-51-165-24-49-57-97-89-144-20-29-35-58-47-90l38-79Z"
        fill="rgba(28, 78, 102, 0.38)"
      />

      <path
        d="M74 46l73-35 23 27c21 39 37 82 50 128 14 52 30 110 48 169 17 58 39 118 67 181 15 34 34 77 58 149h-55c-32-56-57-113-75-170-18-56-33-115-53-177-19-58-44-110-81-165L74 46Z"
        fill="url(#westLandGradient)"
        stroke="#d9e4eb"
        strokeWidth="6"
      />

      <path
        d="M306 78h384v542H532c-8-18-14-40-18-65-8-49-21-101-43-157-20-54-47-110-80-167-25-44-53-85-85-123Z"
        fill="url(#eastLandGradient)"
        stroke="#d8e2e9"
        strokeWidth="6"
      />

      <path
        d="M240 134c26 23 50 53 72 92 23 41 43 86 60 131 18 47 39 92 67 135 28 44 48 95 60 154h-49c-12-51-31-98-58-138-28-43-55-88-76-138-18-42-37-81-61-116-11-16-25-34-43-54l28-8Z"
        fill="rgba(44, 96, 121, 0.46)"
      />

      <g className="map-roads-primary">
        <path d="M154 28c24 38 42 85 56 138 17 63 35 128 59 195 21 59 48 121 83 186 17 32 32 72 47 108" />
        <path d="M108 202c70 2 129 21 181 59 49 37 87 86 129 129 34 36 74 70 133 111" />
        <path d="M264 95c40 45 69 96 89 153 20 56 36 114 70 170" />
        <path d="M181 304c55 11 103 33 144 68 31 27 62 57 91 76" />
      </g>

      <g className="map-roads-secondary">
        <path d="M89 122c48 8 91 31 125 67 28 29 52 65 81 96" />
        <path d="M154 153c26 31 45 67 59 104 16 42 40 83 73 121 28 33 62 65 107 101" />
        <path d="M148 474c56-6 104 4 143 28 18 11 37 26 53 41" />
        <path d="M147 567c61-12 114-5 158 18 16 9 34 20 54 34" />
        <path d="M418 157c32 41 56 91 71 148 18 64 36 122 63 171" />
        <path d="M450 319c36 20 64 49 90 87 17 24 40 50 56 65" />
      </g>

      <g className="map-labels">
        <text x="114" y="214">Juhu</text>
        <text x="168" y="187">Andheri</text>
        <text x="102" y="393">Bandra</text>
        <text x="181" y="456">Dadar</text>
        <text x="144" y="610">Worli</text>
        <text x="96" y="653">Colaba</text>
        <text x="312" y="449">Kurla</text>
        <text x="203" y="340" className="city-label">Mumbai</text>
        <text x="552" y="432" className="city-label">Mumbai</text>
      </g>
    </svg>
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
                  <OfflineMapArt />

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

                  <div className="map-legend">
                    <div className="legend-title">CO2 (ppm):</div>
                    <div className="legend-items">
                      <span>
                        <i className="legend-dot legend-dot--good" />
                        Good (&lt;400)
                      </span>
                      <span>
                        <i className="legend-dot legend-dot--moderate" />
                        Moderate (400-600)
                      </span>
                      <span>
                        <i className="legend-dot legend-dot--danger" />
                        Unhealthy (&gt;600)
                      </span>
                    </div>
                  </div>
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
