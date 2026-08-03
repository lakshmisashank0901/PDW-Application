from fastapi import FastAPI
from fastapi.responses import Response
from pydantic import BaseModel
from typing import List, Optional
import random
import openpyxl
from io import BytesIO
from fastapi.middleware.cors import CORSMiddleware
from itertools import product
from operator import itemgetter

app = FastAPI()

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RadarParam(BaseModel):
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    step: Optional[float] = None
    variance: Optional[float] = None
    count: Optional[int] = 1

class RadarConfig(BaseModel):
    frequency: RadarParam
    pulse_width: RadarParam
    pri: RadarParam
    amplitude: RadarParam
    doa_az: RadarParam
    doa_el: RadarParam
    toa_initial: float = 0.0

class GenerationRequest(BaseModel):
    radars: List[RadarConfig]
    shuffle: bool = False

@app.get("/")
def read_root():
    return {"Hello": "World"}

@app.post("/generate")
def generate_excel(request: GenerationRequest):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Radar Data"
    
    include_radar_id = len(request.radars) > 1
    
    # Column Order: Radar ID first (if multiple), then others
    headers = ["Frequency", "Pulse Width", "PRI", "Amplitude", "DOA Az", "DOA El", "TOA", "Pulse Count"]
    if include_radar_id:
        headers.insert(0, "Radar Number")
    
    ws.append(headers)

    all_radars_data = []

    for radar_idx, radar_config in enumerate(request.radars):
        params_in_order = [
             radar_config.frequency,
             radar_config.pulse_width,
             radar_config.pri,
             radar_config.amplitude,
             radar_config.doa_az,
             radar_config.doa_el
        ]

        ranges = []
        total_combinations = 1
        
        for param in params_in_order:
            if param.min_val is None:
                # Treat as empty -> Single 'None' value
                ranges.append([None])
                continue

            if param.count is None or param.count < 1:
                param.count = 1

            vals = []
            current = param.min_val
            
            def add_vals(val, n):
                for _ in range(n):
                    vals.append(val)

            if param.step is None or param.step <= 0:
                 add_vals(current, param.count)
            else:
                while current <= param.max_val + 1e-9:
                    add_vals(current, param.count)
                    current += param.step
            
            if not vals: 
                 total_combinations = 0
                 break
            
            ranges.append(vals)
            total_combinations *= len(vals)

        # Safety Check Removed

        base_rows = list(product(*ranges))
        radar_data = []
        cumulative_sum = radar_config.toa_initial
        
        for row in base_rows:
            noisy_row = []
            for idx, val in enumerate(row):
                param = params_in_order[idx]
                if val is None:
                    noisy_row.append(None)
                    continue

                low = val - (param.variance or 0)
                high = val + (param.variance or 0)
                noisy_val = round(random.uniform(low, high), 2)
                noisy_row.append(noisy_val)
            
            # PRI is index 2 in row (Freq, PW, PRI, ...)
            pri_val = noisy_row[2] 
            if pri_val is not None:
                cumulative_sum += pri_val
                toa = round(cumulative_sum, 2)
            else:
                toa = None

            # Structure: [RadarID (Optional), Freq, PW, PRI, Amp, Az, El, TOA, PulseCount=0]
            row_data = noisy_row + [toa, 0]
            if include_radar_id:
                row_data.insert(0, radar_idx + 1)
            
            radar_data.append(row_data)
        
        all_radars_data.extend(radar_data)

    if request.shuffle:
        random.shuffle(all_radars_data)
    else:
        # Determine TOA index dynamically
        # If RadarID present: TOA is index 7.
        # If RadarID absent: TOA is index 6.
        toa_idx = 7 if include_radar_id else 6
        
        # Handle None for empty rows (put them at the end or treat as inf)
        all_radars_data.sort(key=lambda x: x[toa_idx] if x[toa_idx] is not None else float('inf'))

    for i, row in enumerate(all_radars_data):
        # Update Pulse Count (Last Index) to be sequential
        row[-1] = i + 1 
        ws.append(row)

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    
    headers = {
        'Content-Disposition': 'attachment; filename="generated_radar_data.xlsx"'
    }
    return Response(content=output.read(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)

from fastapi import File, UploadFile
import pandas as pd
import io

@app.post("/visualize/upload")
async def upload_file_for_visualization(file: UploadFile = File(...)):
    if not file.filename.endswith(('.xlsx', '.xls', '.csv')):
        return {"error": "Invalid file format. Please upload an Excel or CSV file."}
    
    try:
        contents = await file.read()
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents), engine='openpyxl')
        
        # Replace NaN with None (JSON null)
        df = df.where(pd.notnull(df), None)
        
        # specific for Recharts: array of dicts
        data = df.to_dict(orient='records')
        columns = list(df.columns)
        
        return {
            "filename": file.filename,
            "columns": columns,
            "data": data
        }
    except Exception as e:
        return {"error": str(e)}
