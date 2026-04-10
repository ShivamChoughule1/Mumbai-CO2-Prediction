# Mumbai-CO2-Prediction

An end-to-end Big Data project for predicting $CO_2$ levels in specific areas of Mumbai using the ARIMA time-series model. The project features a distributed processing architecture (Spark/Hadoop simulation), an offline SQLite database, and a high-fidelity React dashboard.🏗️ Project ArchitectureModeling: ARIMA (Statsmodels) for time-series forecasting.Data Processing: Python/Spark for data cleaning and transformation.Storage: Local SQLite Database (Offline & Portable).Backend: FastAPI (Python) for high-performance data serving.Frontend: React.js with Tailwind CSS (Professional Navy/Electric Blue Theme).🚀 Installation & SetupFollow these steps in order to run the project on your local machine.1. Backend Setup (FastAPI & Database)Open your terminal in the root project directory:Bash# Navigate to backend folder

cd backend

# Create a virtual environment
python -m venv venv

# Activate the virtual environment
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# Install required packages (sqlite3 is built-in)
pip install fastapi uvicorn pandas statsmodels sqlalchemy

# Run the backend server
uvicorn main:app --reload
The backend will now be running at: http://127.0.0.1:80002. 


Frontend Setup (React & UI)Open a new terminal window and navigate to the frontend directory:Bash# Navigate to frontend folder

cd frontend

# Install Node.js dependencies
npm install

# Install UI & Charting dependencies
npm install -D tailwindcss postcss autoprefixer
npm install recharts axios

# Initialize Tailwind (if config files are missing)
npx tailwindcss@latest init -p

# Start the React development server
npm run dev
The frontend will now be running at: http://localhost:5173 (or the URL shown in your terminal)

📊 How to UseLaunch Backend: Ensure the FastAPI server is running to fetch data from mumbai_co2.db.Launch Frontend: Open the React dashboard in your browser.Explore: Use the sidebar to select different areas of Mumbai (e.g., Bandra, Kurla, Colaba).Analysis: View historical $CO_2$ trends and the 7-day ARIMA forecast on the interactive charts.

📁 File StructurePlaintextMumbai-CO2-Prediction/
├── backend/                # FastAPI server & SQLite DB
│   ├── main.py             # API Routes
│   ├── mumbai_co2.db       # Offline Database File
│   └── requirements.txt    # Python dependencies
├── frontend/               # React application
│   ├── src/                # UI Components & Logic
│   └── tailwind.config.js  # Theme configuration
├── data/                   # Raw & Processed CSVs
├── notebooks/              # ARIMA model research & tuning
└── README.md               # Installation Guide


🛠️ Tech Stack DetailsFrontend Palette: Deep Navy (#0a192f), Electric Blue (#00d4ff).Prediction Logic: ARIMA $(p, d, q)$ parameters tuned via ADF tests for stationarity.Database: Structured Relational SQLite for zero-config portability.