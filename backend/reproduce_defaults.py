import requests
import openpyxl
from io import BytesIO

# Payload mirroring what processDefaults produces for COMPLETELY EMPTY input (Main Grid)
# Based on LIMITS in RadarGrid.tsx
payload = {
    "radars": [
        {
            "frequency": {"min_val": 1000, "max_val": 40000, "step": 39000, "variance": 0, "count": 1},
            "pulse_width": {"min_val": 1, "max_val": 2000, "step": 1999, "variance": 0, "count": 1},
            "pri": {"min_val": 5, "max_val": 5000, "step": 4995, "variance": 0, "count": 1},
            "amplitude": {"min_val": -100, "max_val": -40, "step": 60, "variance": 0, "count": 1},
            "doa_az": {"min_val": -30, "max_val": 30, "step": 60, "variance": 0, "count": 1},
            "doa_el": {"min_val": -30, "max_val": 30, "step": 60, "variance": 0, "count": 1},
            "toa_initial": 0
        }
    ],
    "shuffle": False
}

try:
    response = requests.post("http://localhost:8000/generate", json=payload)
    
    if response.status_code == 200:
        print("Success: Generated Excel file.")
        wb = openpyxl.load_workbook(BytesIO(response.content))
        ws = wb.active
        rows = list(ws.values)
        print(f"Row count: {len(rows)} (Expected ~65 with header)")
        # Print first few rows
        for i in range(min(5, len(rows))):
             print(f"Row {i}: {rows[i]}")
    else:
        print(f"Failed: {response.status_code}")
        print(response.text)

except Exception as e:
    print(f"Error: {e}")
