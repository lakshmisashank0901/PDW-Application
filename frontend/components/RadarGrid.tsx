"use client";

import React, { useState } from 'react';
import { API_URL, errorMessage, readApiError } from '@/lib/api';

// Use union type to allow blank inputs
type RadarParamValue = number | "";

type RadarParam = {
    min_val: RadarParamValue;
    max_val: RadarParamValue;
    step: RadarParamValue;
    variance: RadarParamValue;
    count: RadarParamValue;
};

type ParamKey = 'frequency' | 'pulse_width' | 'pri' | 'amplitude' | 'doa_az' | 'doa_el';
const PARAM_KEYS: ParamKey[] = ['frequency', 'pulse_width', 'pri', 'amplitude', 'doa_az', 'doa_el'];

// Main Grid State
type FormData = Record<ParamKey, RadarParam> & {
    toa_initial: RadarParamValue;
    shuffle: boolean;
};

// Backend Expected Config (null = parameter left empty)
type ApiParam = {
    min_val: number | null;
    max_val: number | null;
    step: number | null;
    variance: number | null;
    count: number;
};

type RadarConfig = Record<ParamKey, ApiParam> & {
    toa_initial: number;
};

// Initial State is BLANK
const defaultParam: RadarParam = {
    min_val: "",
    max_val: "",
    step: "",
    variance: "",
    count: "",
};

const initialData: FormData = {
    frequency: { ...defaultParam },
    pulse_width: { ...defaultParam },
    pri: { ...defaultParam },
    amplitude: { ...defaultParam },
    doa_az: { ...defaultParam },
    doa_el: { ...defaultParam },
    toa_initial: "",
    shuffle: false,
};

// Validation Constants
const LIMITS: Record<ParamKey, { min: number; max: number; varMax: number }> = {
    frequency: { min: 1000, max: 40000, varMax: 3 },
    pulse_width: { min: 1, max: 2000, varMax: 0.2 },
    pri: { min: 5, max: 5000, varMax: 0.2 },
    amplitude: { min: -100, max: -40, varMax: 1 },
    doa_az: { min: -30, max: 30, varMax: 1 },
    doa_el: { min: -30, max: 30, varMax: 1 },
};

// Values used by the Radar Inputs box when a field is left blank
const SIMPLE_DEFAULTS: Record<ParamKey, number> = {
    frequency: 1000,
    pulse_width: 10,
    pri: 100,
    amplitude: -50,
    doa_az: 0,
    doa_el: 0,
};

const emptySimpleBox = (): Record<ParamKey, string> => ({
    frequency: "",
    pulse_width: "",
    pri: "",
    amplitude: "",
    doa_az: "",
    doa_el: "",
});

const paramLabel = (key: ParamKey) => key.toUpperCase().replace('_', ' ');

const getParamStatus = (param: RadarParam): "EMPTY" | "PARTIAL" | "FULL" => {
    const fields = [param.min_val, param.max_val, param.step, param.variance, param.count];
    const emptyCount = fields.filter(f => f === "").length;

    if (emptyCount === 5) return "EMPTY";
    if (emptyCount === 0) return "FULL";
    return "PARTIAL";
};

const fixedParam = (value: number): ApiParam => ({ min_val: value, max_val: value, step: 0, variance: 0, count: 1 });

const emptyApiParam = (): ApiParam => ({ min_val: null, max_val: null, step: null, variance: null, count: 1 });

export default function RadarGrid() {
    const [formData, setFormData] = useState<FormData>(initialData);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Auto Fill State
    const [autoFill, setAutoFill] = useState(true);

    // Simple Box State
    const [simpleTotalRadars, setSimpleTotalRadars] = useState<number | "">("");
    const [simpleCurrentIndex, setSimpleCurrentIndex] = useState(0); // 0-indexed
    const [simpleBox, setSimpleBox] = useState(emptySimpleBox);
    const [simpleRadars, setSimpleRadars] = useState<RadarConfig[]>([]);

    const validateInput = (category: ParamKey, field: keyof RadarParam, value: RadarParamValue) => {
        if (value === "") return null;

        const limits = LIMITS[category];

        if (field === 'min_val' || field === 'max_val') {
            if (value < limits.min || value > limits.max) {
                return `Range: ${limits.min} to ${limits.max}`;
            }
        }
        if (field === 'variance') {
            if (value < 0 || value > limits.varMax) {
                return `Var Max: ${limits.varMax}`;
            }
        }
        if (field === 'step' && value < 0) {
            return 'Step must be >= 0';
        }
        if (field === 'count' && (value < 1 || !Number.isInteger(value))) {
            return 'Count must be a whole number >= 1';
        }
        return null;
    };

    const parseInput = (value: string): RadarParamValue => (value === "" ? "" : parseFloat(value));

    const handleParamChange = (category: ParamKey, field: keyof RadarParam, value: string) => {
        const numVal = parseInput(value);

        const errorMsg = validateInput(category, field, numVal);
        setErrors(prev => ({
            ...prev,
            [`${category}-${field}`]: errorMsg || ""
        }));

        setFormData(prev => ({
            ...prev,
            [category]: {
                ...prev[category],
                [field]: numVal
            }
        }));
    };

    const handleSimpleChange = (field: ParamKey, value: string) => {
        setSimpleBox(prev => ({ ...prev, [field]: value }));
    };

    // Build a fixed-value config from the simple box; returns an error message if a value is out of range
    const createSimpleConfig = (): RadarConfig | string => {
        const config = { toa_initial: formData.toa_initial === "" ? 0 : formData.toa_initial } as RadarConfig;

        for (const key of PARAM_KEYS) {
            const raw = simpleBox[key].trim();
            const value = raw === "" ? SIMPLE_DEFAULTS[key] : parseFloat(raw);
            const limit = LIMITS[key];
            if (!Number.isFinite(value) || value < limit.min || value > limit.max) {
                return `${paramLabel(key)} must be between ${limit.min} and ${limit.max}.`;
            }
            config[key] = fixedParam(value);
        }
        return config;
    };

    const handleAddSimpleSequential = async (e: React.FormEvent) => {
        e.preventDefault();

        const total = typeof simpleTotalRadars === 'number' ? simpleTotalRadars : 0;
        if (total <= 0) {
            alert("Please enter a valid number of radars first.");
            return;
        }

        const currentConfig = createSimpleConfig();
        if (typeof currentConfig === 'string') {
            alert(currentConfig);
            return;
        }

        if (simpleCurrentIndex < total - 1) {
            // ADD: queue this radar and clear inputs for the next one (keep No of Radars)
            setSimpleRadars(prev => [...prev, currentConfig]);
            setSimpleCurrentIndex(prev => prev + 1);
            setSimpleBox(emptySimpleBox());
        } else {
            // GENERATE (Last Radar), then reset for the next batch
            const finalRadars = [...simpleRadars, currentConfig];
            await generatePayload(finalRadars);

            setSimpleRadars([]);
            setSimpleCurrentIndex(0);
            setSimpleTotalRadars("");
            setSimpleBox(emptySimpleBox());
        }
    };

    const generatePayload = async (radars: RadarConfig[]) => {
        setLoading(true);
        const payload = {
            radars: radars,
            shuffle: formData.shuffle
        };

        try {
            const response = await fetch(`${API_URL}/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                throw new Error(await readApiError(response, 'Generation failed'));
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `radar_data_simple_${Date.now()}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error(error);
            alert(errorMessage(error));
        } finally {
            setLoading(false);
        }
    }

    // Auto Fill ON: fill each blank field (min/max from LIMITS, step = 3-point sweep)
    // Auto Fill OFF: FULL params are sent as-is, EMPTY ones are sent as null (validated beforehand)
    const toApiParam = (key: ParamKey, param: RadarParam): ApiParam => {
        if (!autoFill) {
            if (getParamStatus(param) === "EMPTY") return emptyApiParam();
            return param as ApiParam;
        }

        const limit = LIMITS[key];
        const min_val = param.min_val === "" ? limit.min : param.min_val;
        const max_val = param.max_val === "" ? limit.max : param.max_val;
        const range = max_val - min_val;
        return {
            min_val,
            max_val,
            step: param.step === "" ? (range > 0 ? range / 2 : 1) : param.step,
            variance: param.variance === "" ? 0 : param.variance,
            count: param.count === "" ? 1 : param.count,
        };
    };

    const handleGridSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const hasErrors = Object.values(errors).some(msg => msg !== "");
        if (hasErrors) {
            alert("Please fix validation errors (red fields) before generating.");
            return;
        }

        if (!autoFill) {
            const partial = PARAM_KEYS.find(key => getParamStatus(formData[key]) === "PARTIAL");
            if (partial) {
                alert(`Auto Fill is OFF. ${paramLabel(partial)} is incomplete. Please fill all fields or leave entirely empty.`);
                return;
            }
        }

        const gridConfig = { toa_initial: formData.toa_initial === "" ? 0 : formData.toa_initial } as RadarConfig;
        for (const key of PARAM_KEYS) {
            gridConfig[key] = toApiParam(key, formData[key]);
        }

        await generatePayload([gridConfig]);
    };

    return (
        <div className="flex flex-col xl:flex-row gap-8 w-full items-start">

            {/* LEFT: Main Grid */}
            <form onSubmit={handleGridSubmit} className="flex-1 w-full order-2 xl:order-1">
                {/* 3x2 Grid Layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-8 mb-12">
                    {([
                        { label: 'FREQUENCY', unit: 'MHz', id: 'frequency', color: 'text-blue-400', border: 'border-blue-500/30' },
                        { label: 'PULSE WIDTH', unit: 'µs', id: 'pulse_width', color: 'text-emerald-400', border: 'border-emerald-500/30' },
                        { label: 'PRI - PULSE REPETITION INTERVAL', unit: 'µs', id: 'pri', color: 'text-violet-400', border: 'border-violet-500/30' },
                        { label: 'AMPLITUDE', unit: 'dBm', id: 'amplitude', color: 'text-amber-400', border: 'border-amber-500/30' },
                        { label: 'DOA AZIMUTHAL', unit: 'deg', id: 'doa_az', color: 'text-rose-400', border: 'border-rose-500/30' },
                        { label: 'DOA ELEVATION', unit: 'deg', id: 'doa_el', color: 'text-cyan-400', border: 'border-cyan-500/30' },
                    ] as const).map((row) => {
                        const category: ParamKey = row.id;
                        const data = formData[category];

                        return (
                            <div key={row.id} className={`bg-slate-900/40 backdrop-blur-md border ${row.border} rounded-xl p-5 shadow-xl flex flex-col`}>

                                {/* Card Header */}
                                <div className="mb-5 pb-3 border-b border-white/5">
                                    <div className="flex justify-between items-center mb-1">
                                        <h3 className={`font-black tracking-widest text-sm ${row.color}`}>
                                            {row.label}
                                        </h3>
                                        <div className="text-[10px] font-bold text-slate-400 bg-white/5 px-2 py-0.5 rounded">
                                            {row.unit}
                                        </div>
                                    </div>
                                    {/* Range Display */}
                                    <div className="flex flex-col gap-1 text-[10px] text-slate-500 font-mono mt-2">
                                        <span>Range: <span className="text-slate-300 font-bold">[{LIMITS[category].min} - {LIMITS[category].max}]</span></span>
                                        <span>Variance Max: <span className="text-slate-300 font-bold">{LIMITS[category].varMax}</span></span>
                                    </div>
                                </div>

                                {/* Inputs Grid */}
                                <div className="space-y-3 flex-grow">
                                    {([
                                        { label: 'Min', field: 'min_val', placeholder: LIMITS[category].min },
                                        { label: 'Max', field: 'max_val', placeholder: LIMITS[category].max },
                                        { label: 'Step', field: 'step', placeholder: '1' },
                                        { label: 'Variance', field: 'variance', placeholder: '0' },
                                        { label: 'Count', field: 'count', placeholder: '1' },
                                    ] as const).map(({ label, field, placeholder }) => {
                                        const errorKey = `${category}-${field}`;
                                        const hasError = errors[errorKey];

                                        return (
                                            <div key={`${row.id}-${field}`} className="grid grid-cols-[70px_1fr] items-center gap-3 relative">
                                                <label className="text-right text-[11px] font-bold text-slate-500 uppercase whitespace-nowrap">
                                                    {label}
                                                </label>
                                                <div className="">
                                                    <input
                                                        type="number"
                                                        step={field === 'count' ? '1' : 'any'}
                                                        placeholder={String(placeholder)}
                                                        className={`w-full bg-slate-950/80 border rounded px-3 py-1.5 text-sm font-mono text-slate-200 outline-none transition-all text-right placeholder-slate-700
                                                            ${hasError ? 'border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500' : 'border-slate-800 focus:border-white/20 focus:ring-1 focus:ring-white/10 hover:border-slate-700'}
                                                        `}
                                                        value={data[field]}
                                                        onChange={(e) => handleParamChange(category, field, e.target.value)}
                                                    />
                                                    {/* Error Message */}
                                                    {hasError && (
                                                        <div className="absolute top-full right-0 mt-0.5 text-[9px] font-bold text-red-500 tracking-wide z-10 bg-slate-950/90 px-1 rounded border border-red-500/20">
                                                            {hasError}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Floating Action Bar */}
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl bg-slate-950/90 backdrop-blur-xl border border-white/10 rounded-full px-2 py-2 shadow-2xl shadow-sky-900/20 flex items-center justify-between gap-4 z-50">

                    <div className="flex-1 flex items-center justify-center gap-4 pl-4 overflow-x-auto">
                        <span className="hidden md:inline text-[10px] font-bold text-slate-500 uppercase tracking-widest">Config</span>
                        <div className="h-4 w-px bg-white/10 hidden md:block"></div>

                        <div className="flex items-center gap-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">Init TOA</label>
                            <input
                                type="number"
                                step="any"
                                placeholder="0"
                                className="w-16 md:w-24 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs font-mono text-white font-bold outline-none focus:border-sky-500/50 transition-colors text-center placeholder-slate-600"
                                value={formData.toa_initial}
                                onChange={(e) => setFormData(prev => ({ ...prev, toa_initial: parseInput(e.target.value) }))}
                            />
                        </div>

                        <div className="h-4 w-px bg-white/10 hidden md:block"></div>

                        {/* Auto Fill Toggle */}
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setAutoFill(!autoFill)}>
                            <div className={`w-8 h-4 rounded-full p-0.5 flex items-center transition-colors ${autoFill ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                                <div className={`w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${autoFill ? 'translate-x-full' : 'translate-x-0'}`}></div>
                            </div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap cursor-pointer hover:text-white transition-colors">Auto Fill</label>
                        </div>

                        <div className="h-4 w-px bg-white/10 hidden md:block"></div>

                        {/* Shuffle Toggle */}
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setFormData(prev => ({ ...prev, shuffle: !prev.shuffle }))}>
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${formData.shuffle ? 'bg-sky-500 border-sky-500' : 'bg-transparent border-slate-600'}`}>
                                {formData.shuffle && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>}
                            </div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap cursor-pointer hover:text-white transition-colors">Shuffle</label>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className={`
                            bg-sky-600 hover:bg-sky-500 text-white text-xs font-black py-3 px-8 rounded-full shadow-lg active:scale-95 transition-all flex items-center gap-2
                            ${loading ? 'opacity-75 cursor-not-allowed' : ''}
                        `}
                    >
                        {loading ? (
                            <>
                                <div className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                <span>BUSY</span>
                            </>
                        ) : (
                            <>
                                <span>GENERATE</span>
                            </>
                        )}
                    </button>
                </div>

                <div className="h-24"></div>
            </form>

            {/* RIGHT: Simple Box (New Feature) */}
            <div className={`w-full xl:w-80 shrink-0 order-1 xl:order-2 border rounded-lg p-5 backdrop-blur-sm self-start sticky top-10 transition-colors ${simpleTotalRadars !== "" ? 'border-sky-500/50 bg-sky-950/20' : 'border-white/20 bg-black/40'}`}>
                <div className="flex justify-between items-center mb-6 border-b border-white/10 pb-2">
                    <h3 className="text-sm font-bold text-white uppercase tracking-widest">Radar Inputs</h3>
                    {simpleTotalRadars !== "" && (
                        <div className="text-[9px] font-mono text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded">
                            {simpleCurrentIndex + 1}/{simpleTotalRadars}
                        </div>
                    )}
                </div>

                <div className="space-y-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-slate-400 uppercase">No of Radars</label>
                        <input
                            type="number"
                            min="1"
                            className={`bg-slate-900 border rounded px-2 py-1.5 text-sm text-white outline-none focus:border-white/40 transition-colors placeholder-slate-600 ${simpleTotalRadars !== "" ? 'border-sky-500/50 text-sky-400' : 'border-slate-700'}`}
                            placeholder="0"
                            value={simpleTotalRadars}
                            onChange={(e) => {
                                const val = e.target.value === "" ? "" : parseInt(e.target.value);
                                setSimpleTotalRadars(val);
                                // If changed, reset tracking
                                setSimpleCurrentIndex(0);
                                setSimpleRadars([]);
                            }}
                        />
                    </div>

                    {([
                        { label: 'Frequency', id: 'frequency' },
                        { label: 'Pulse Width', id: 'pulse_width' },
                        { label: 'PRI', id: 'pri' },
                        { label: 'Amplitude', id: 'amplitude' },
                        { label: 'DOA Az', id: 'doa_az' },
                        { label: 'DOA El', id: 'doa_el' },
                    ] as const).map((field) => (
                        <div key={field.id} className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-slate-400 uppercase">{field.label}</label>
                            <input
                                type="number"
                                className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-white/40 transition-colors placeholder-slate-600"
                                placeholder={String(SIMPLE_DEFAULTS[field.id])}
                                value={simpleBox[field.id]}
                                onChange={(e) => handleSimpleChange(field.id, e.target.value)}
                            />
                        </div>
                    ))}

                    <button
                        type="button"
                        onClick={handleAddSimpleSequential}
                        className={`w-full mt-4 font-bold text-sm py-2 rounded shadow transition-all
                            ${(typeof simpleTotalRadars === 'number' && simpleCurrentIndex >= simpleTotalRadars - 1)
                                ? 'bg-emerald-500 hover:bg-emerald-400 text-white'
                                : 'bg-white hover:bg-slate-200 text-black'}
                        `}
                    >
                        {(typeof simpleTotalRadars === 'number' && simpleCurrentIndex >= simpleTotalRadars - 1) ? 'GENERATE' : 'Add'}
                    </button>

                    {/* Queue Status */}
                    {simpleRadars.length > 0 && typeof simpleTotalRadars === 'number' && (
                        <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center px-1">
                            {simpleRadars.map((_, i) => (
                                <div key={i} className="h-1.5 w-full mx-0.5 rounded-full bg-sky-500"></div>
                            ))}
                            {Array.from({ length: simpleTotalRadars - simpleRadars.length }).map((_, i) => (
                                <div key={i} className="h-1.5 w-full mx-0.5 rounded-full bg-slate-700"></div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
}
