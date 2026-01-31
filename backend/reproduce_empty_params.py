import requests
import openpyxl
from io import BytesIO
import json

# Payload with empty parameters (nulls)
payload = {
    "radars": [
        {
            "frequency": {"min_val": 1000, "max_val": 2000, "step": 100, "variance": 0, "count": 1},
            # Pulse Width completely empty -> Should be skipped
            "pulse_width": {"min_val": None, "max_val": None, "step": None, "variance": None, "count": 1},
            "pri": {"min_val": 100, "max_val": 100, "step": 0, "variance": 0, "count": 1},
            "amplitude": {"min_val": -50, "max_val": -50, "step": 0, "variance": 0, "count": 1},
            "doa_az": {"min_val": 0, "max_val": 0, "step": 0, "variance": 0, "count": 1},
            "doa_el": {"min_val": 0, "max_val": 0, "step": 0, "variance": 0, "count": 1},
            "toa_initial": 0
        }
    ],
    "shuffle": False
}

print(f"Sending payload: {json.dumps(payload, indent=2)}")

try:
    response = requests.post("http://localhost:8000/generate", json=payload)
    
    if response.status_code == 200:
        print("Success: Generated Excel file.")
        wb = openpyxl.load_workbook(BytesIO(response.content))
        ws = wb.active
        rows = list(ws.values)
        print(f"Row count: {len(rows)}")
        for i, row in enumerate(rows[:5]):
            print(f"Row {i}: {row}")
    else:
        print(f"Failed: {response.status_code}")
        print(response.text)

except Exception as e:
    print(f"Error: {e}")
