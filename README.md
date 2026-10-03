# PDW Simulator

Desktop tool for generating and inspecting radar Pulse Descriptor Word (PDW) data.

- **Generator** – sweep frequency, pulse width, PRI, amplitude and DOA (az/el) over min/max/step ranges with random variance, and download the result as `.xlsx`. TOA is the running sum of PRI. Multiple fixed-value radars can be queued from the *Radar Inputs* panel.
- **Visualizer** – upload one or more `.csv`/`.xlsx` captures (e.g. the QDR files in `Test Files/`) and plot any column against row index. Supports overlaying files, drag-zoom, shift-pan, synced zoom/hover, limit lines, undo/redo and hiding dummy PDs.

## Layout

| Path | Contents |
| --- | --- |
| `backend/main.py` | FastAPI app: `POST /generate`, `POST /visualize/upload` |
| `backend/tests/` | pytest suite (uses files from `Test Files/`) |
| `frontend/` | Next.js 16 + React 19 + Tailwind 4 + Chart.js UI |
| `Test Files/` | Sample QDR captures and spreadsheets |

## Running locally

Backend (Python 3.10+):

```sh
cd backend
python -m venv venv
venv/bin/pip install -r requirements-dev.txt
venv/bin/uvicorn main:app --reload --port 8000
```

Frontend:

```sh
cd frontend
npm install
npm run dev        # http://localhost:3000
```

The frontend calls `http://localhost:8000` by default; set `NEXT_PUBLIC_API_URL` to point elsewhere.

## Tests and checks

```sh
cd backend && venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit && npm run lint
```

## Notes

- `/generate` refuses requests that would produce more than 1,000,000 rows (`MAX_ROWS` in `backend/main.py`); the sweep is a cartesian product of all six parameters.
- "Hide Dummy PD" drops rows where `PD_Type`/`PdType` is `15`, or where `Pd` is `DummyPD`.
