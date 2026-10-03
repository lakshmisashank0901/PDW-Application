import io
from pathlib import Path

import openpyxl
import pytest
from fastapi.testclient import TestClient

from main import MAX_ROWS, app

client = TestClient(app)
TEST_FILES = Path(__file__).resolve().parents[2] / "Test Files"

EMPTY = {"min_val": None, "max_val": None, "step": None, "variance": None, "count": 1}


def radar(**overrides):
    config = {k: dict(EMPTY) for k in ("frequency", "pulse_width", "pri", "amplitude", "doa_az", "doa_el")}
    config.update(overrides)
    config["toa_initial"] = 0
    return config


def sweep(lo, hi, step, variance=0, count=1):
    return {"min_val": lo, "max_val": hi, "step": step, "variance": variance, "count": count}


def read_rows(response):
    wb = openpyxl.load_workbook(io.BytesIO(response.content))
    return list(wb.active.iter_rows(values_only=True))


def test_generate_sweep_and_toa():
    body = {"radars": [radar(frequency=sweep(1000, 1002, 1), pri=sweep(10, 10, 0, count=2))]}
    response = client.post("/generate", json=body)
    assert response.status_code == 200
    rows = read_rows(response)
    assert rows[0] == ("Frequency", "Pulse Width", "PRI", "Amplitude", "DOA Az", "DOA El", "TOA", "Pulse Count")
    data = rows[1:]
    assert len(data) == 3 * 2
    assert sorted({r[0] for r in data}) == [1000, 1001, 1002]
    assert [r[6] for r in data] == [10, 20, 30, 40, 50, 60]
    assert [r[7] for r in data] == [1, 2, 3, 4, 5, 6]
    assert all(r[1] is None for r in data)


def test_generate_multiple_radars_adds_id_column():
    body = {"radars": [radar(pri=sweep(10, 10, 0)), radar(pri=sweep(15, 15, 0))]}
    rows = read_rows(client.post("/generate", json=body))
    assert rows[0][0] == "Radar Number"
    assert {r[0] for r in rows[1:]} == {1, 2}


def test_generate_rejects_huge_sweep():
    body = {"radars": [radar(frequency=sweep(1000, 40000, 0.01))]}
    response = client.post("/generate", json=body)
    assert response.status_code == 400
    assert f"{MAX_ROWS:,}" in response.json()["detail"]


@pytest.mark.parametrize("param", [
    {"min_val": 1000, "max_val": None, "step": 1, "variance": 0, "count": 1},
    {"min_val": 2000, "max_val": 1000, "step": 1, "variance": 0, "count": 1},
    {"min_val": 1000, "max_val": 1000, "step": 0, "variance": -1, "count": 1},
    {"min_val": 1000, "max_val": 1000, "step": 0, "variance": 0, "count": 0},
])
def test_generate_rejects_invalid_params(param):
    response = client.post("/generate", json={"radars": [radar(frequency=param)]})
    assert response.status_code == 422


def test_upload_rejects_bad_extension():
    response = client.post("/visualize/upload", files={"file": ("x.txt", b"a,b\n1,2\n")})
    assert response.status_code == 400


def test_upload_strips_column_names_in_qdr_csv():
    path = next(TEST_FILES.glob("QDR*.csv"))
    response = client.post("/visualize/upload", files={"file": (path.name, path.read_bytes())})
    assert response.status_code == 200
    result = response.json()
    assert "Pd" in result["columns"]
    assert all(c == c.strip() for c in result["columns"])
    assert result["data"][0]["Pd"] == "DummyPD"


def test_upload_xlsx_test_file():
    path = TEST_FILES / "Book1.xlsx"
    response = client.post("/visualize/upload", files={"file": (path.name, path.read_bytes())})
    assert response.status_code == 200
    assert "PD_Type" in response.json()["columns"]


def test_generated_file_with_blank_cells_round_trips():
    generated = client.post("/generate", json={"radars": [radar(pri=sweep(10, 12, 1))]})
    response = client.post("/visualize/upload", files={"file": ("gen.xlsx", generated.content)})
    assert response.status_code == 200
    first = response.json()["data"][0]
    assert first["Frequency"] is None
    assert first["PRI"] is not None
