from main import app, RadarParam, GenerationRequest
from fastapi.testclient import TestClient
import openpyxl
from io import BytesIO

client = TestClient(app)

req_data = {
    "frequency": {"min_val": 1000, "max_val": 2000, "step": 1000, "variance": 0, "count": 1},
    "pulse_width": {"min_val": 10, "max_val": 20, "step": 10, "variance": 0, "count": 1},
    "pri": {"min_val": 100, "max_val": 200, "step": 100, "variance": 0, "count": 1},
    "amplitude": {"min_val": 10, "max_val": 20, "step": 10, "variance": 0, "count": 1},
    "doa_az": {"min_val": 0, "max_val": 10, "step": 10, "variance": 0, "count": 1},
    "doa_el": {"min_val": 0, "max_val": 10, "step": 10, "variance": 0, "count": 1},
    "toa_initial": 0
}

response = client.post("/generate", json=req_data)
print(f"Status Code: {response.status_code}")

if response.status_code == 200:
    content = BytesIO(response.content)
    wb = openpyxl.load_workbook(content)
    ws = wb.active
    rows = list(ws.values)
    print(f"Total Rows in Excel: {len(rows)}")
    if len(rows) > 0:
        print(f"Header: {rows[0]}")
    if len(rows) > 1:
        print(f"First Row: {rows[1]}")
else:
    print(response.text)
