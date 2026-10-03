import io
import random
from itertools import product
from typing import List, Optional

import numpy as np
import openpyxl
import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field, model_validator

# Upper bound on rows produced by /generate (the parameter sweep is a cartesian product)
MAX_ROWS = 1_000_000

app = FastAPI()

# Enable CORS for frontend. No cookies/auth are used, so credentials stay off.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RadarParam(BaseModel):
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    step: Optional[float] = None
    variance: Optional[float] = Field(default=None, ge=0)
    count: Optional[int] = Field(default=1, ge=1)

    @model_validator(mode="after")
    def check_range(self):
        if self.min_val is None:
            return self
        if self.step is not None and self.step > 0:
            if self.max_val is None:
                raise ValueError("max_val is required when step > 0")
            if self.max_val < self.min_val:
                raise ValueError("max_val must be >= min_val")
        return self

    def values(self) -> list:
        """Expand this parameter into its sweep values (each repeated `count` times)."""
        if self.min_val is None:
            return [None]
        count = self.count or 1
        if self.step is None or self.step <= 0:
            return [self.min_val] * count
        n_steps = int((self.max_val - self.min_val) / self.step + 1e-9) + 1
        return [self.min_val + i * self.step for i in range(n_steps) for _ in range(count)]

    def sweep_size(self) -> int:
        if self.min_val is None:
            return 1
        count = self.count or 1
        if self.step is None or self.step <= 0:
            return count
        return (int((self.max_val - self.min_val) / self.step + 1e-9) + 1) * count


class RadarConfig(BaseModel):
    frequency: RadarParam
    pulse_width: RadarParam
    pri: RadarParam
    amplitude: RadarParam
    doa_az: RadarParam
    doa_el: RadarParam
    toa_initial: float = 0.0

    def params_in_order(self) -> List[RadarParam]:
        return [self.frequency, self.pulse_width, self.pri, self.amplitude, self.doa_az, self.doa_el]


class GenerationRequest(BaseModel):
    radars: List[RadarConfig] = Field(min_length=1)
    shuffle: bool = False


@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.post("/generate")
def generate_excel(request: GenerationRequest):
    # Reject sweeps that would explode before doing any work
    total_rows = 0
    for radar_config in request.radars:
        radar_rows = 1
        for param in radar_config.params_in_order():
            radar_rows *= param.sweep_size()
        total_rows += radar_rows
    if total_rows > MAX_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"Configuration would generate {total_rows:,} rows (limit {MAX_ROWS:,}). Increase step sizes or reduce counts.",
        )

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
        params_in_order = radar_config.params_in_order()
        ranges = [param.values() for param in params_in_order]

        cumulative_sum = radar_config.toa_initial

        for row in product(*ranges):
            noisy_row = []
            for param, val in zip(params_in_order, row):
                if val is None:
                    noisy_row.append(None)
                    continue
                variance = param.variance or 0
                noisy_row.append(round(random.uniform(val - variance, val + variance), 2))

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

            all_radars_data.append(row_data)

    if request.shuffle:
        random.shuffle(all_radars_data)
    else:
        toa_idx = headers.index("TOA")
        # Rows without a TOA go to the end
        all_radars_data.sort(key=lambda x: x[toa_idx] if x[toa_idx] is not None else float('inf'))

    for i, row in enumerate(all_radars_data):
        # Update Pulse Count (Last Index) to be sequential
        row[-1] = i + 1
        ws.append(row)

    output = io.BytesIO()
    wb.save(output)

    return Response(
        content=output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={'Content-Disposition': 'attachment; filename="generated_radar_data.xlsx"'},
    )


@app.post("/visualize/upload")
async def upload_file_for_visualization(file: UploadFile = File(...)):
    filename = file.filename or ""
    if not filename.lower().endswith(('.xlsx', '.xls', '.csv')):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload an Excel or CSV file.")

    contents = await file.read()
    try:
        if filename.lower().endswith('.csv'):
            # QDR captures use ", " as the separator
            df = pd.read_csv(io.BytesIO(contents), skipinitialspace=True)
        else:
            df = pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read {filename}: {e}")

    df.columns = [str(c).strip() for c in df.columns]

    # NaN/inf are not valid JSON; cast to object first so None survives in numeric columns
    df = df.replace([np.inf, -np.inf], np.nan).astype(object)
    df = df.where(pd.notnull(df), None)

    return {
        "filename": filename,
        "columns": list(df.columns),
        "data": df.to_dict(orient='records'),
    }
