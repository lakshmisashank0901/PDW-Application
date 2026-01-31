"use client";

import React, { useState } from 'react';

// Use union type to allow blank inputs
type RadarParamValue = number | "";

type RadarParam = {
    min_val: RadarParamValue;
    max_val: RadarParamValue;
    step: RadarParamValue;
    variance: RadarParamValue;
    count: RadarParamValue;
};

// Main Grid State
type FormData = {
    frequency: RadarParam;
    pulse_width: RadarParam;
    pri: RadarParam;
    amplitude: RadarParam;
    doa_az: RadarParam;
    doa_el: RadarParam;
    toa_initial: RadarParamValue;
    shuffle: boolean;
};

// Backend Expected Config
type RadarConfig = {
    frequency: RadarParam;
    pulse_width: RadarParam;
    pri: RadarParam;
    amplitude: RadarParam;
    doa_az: RadarParam;
    doa_el: RadarParam;
    toa_initial: RadarParamValue;
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
const LIMITS: Record<string, { min: number; max: number; varMax: number }> = {
    frequency: { min: 1000, max: 40000, varMax: 3 },
    pulse_width: { min: 1, max: 2000, varMax: 0.2 },
    pri: { min: 5, max: 5000, varMax: 0.2 },
    amplitude: { min: -100, max: -40, varMax: 1 },
    doa_az: { min: -30, max: 30, varMax: 1 },
    doa_el: { min: -30, max: 30, varMax: 1 },
};

export default function RadarGrid() {
    const [formData, setFormData] = useState<FormData>(initialData);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Auto Fill State
    const [autoFill, setAutoFill] = useState(true);

    // Simple Box State
    const [simpleTotalRadars, setSimpleTotalRadars] = useState<number | "">("");
    const [simpleCurrentIndex, setSimpleCurrentIndex] = useState(0); // 0-indexed
    const [simpleBox, setSimpleBox] = useState({
        frequency: "",
        pulse_width: "",
        pri: "",
        amplitude: "",
        doa_az: "",
        doa_el: ""
    });
    const [simpleRadars, setSimpleRadars] = useState<RadarConfig[]>([]);

    const validateInput = (category: string, field: string, value: RadarParamValue) => {
        if (value === "") return null;

        const limits = LIMITS[category];
        if (!limits) return null;

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
        return null;
    };

    const handleChange = (
        category: keyof FormData,
        field: keyof RadarParam | "val" | "checked",
        value: string | boolean
    ) => {
        if (category === "shuffle") {
            setFormData(prev => ({ ...prev, shuffle: value as boolean }));
            return;
        }

        const strVal = value as string;
        const numVal = strVal === "" ? "" : parseFloat(strVal);

        if (category === "toa_initial") {
            setFormData(prev => ({ ...prev, toa_initial: numVal as RadarParamValue }));
            return;
        }

        const errorMsg = validateInput(category, field as string, numVal);
        setErrors(prev => ({
            ...prev,
            [`${category}-${field}`]: errorMsg || ""
        }));

        setFormData(prev => ({
            ...prev,
            [category]: {
                ...(prev[category as keyof FormData] as RadarParam),
                [field]: numVal
            }
        }));
    };

    const handleSimpleChange = (field: string, value: string) => {
        setSimpleBox(prev => ({ ...prev, [field]: value }));
    };

    // Helper to create config from simple box inputs
    const createSimpleConfig = (): RadarConfig => ({
        frequency: { min_val: parseFloat(simpleBox.frequency) || 1000, max_val: parseFloat(simpleBox.frequency) || 1000, step: 0, variance: 0, count: 1 },
        pulse_width: { min_val: parseFloat(simpleBox.pulse_width) || 10, max_val: parseFloat(simpleBox.pulse_width) || 10, step: 0, variance: 0, count: 1 },
        pri: { min_val: parseFloat(simpleBox.pri) || 100, max_val: parseFloat(simpleBox.pri) || 100, step: 0, variance: 0, count: 1 },
        amplitude: { min_val: parseFloat(simpleBox.amplitude) || -50, max_val: parseFloat(simpleBox.amplitude) || -50, step: 0, variance: 0, count: 1 },
        doa_az: { min_val: parseFloat(simpleBox.doa_az) || 0, max_val: parseFloat(simpleBox.doa_az) || 0, step: 0, variance: 0, count: 1 },
        doa_el: { min_val: parseFloat(simpleBox.doa_el) || 0, max_val: parseFloat(simpleBox.doa_el) || 0, step: 0, variance: 0, count: 1 },
        toa_initial: formData.toa_initial === "" ? 0 : formData.toa_initial // Propagate initial TOA safely
    });

    const handleAddSimpleSequential = async (e: React.FormEvent) => {
        e.preventDefault();

        const total = typeof simpleTotalRadars === 'number' ? simpleTotalRadars : 0;
        if (total <= 0) {
            alert("Please enter a valid number of radars first.");
            return;
        }

        const currentConfig = createSimpleConfig();

        // Logic: ADD or GENERATE
        if (simpleCurrentIndex < total - 1) {
            // ACTION: ADD
            setSimpleRadars(prev => [...prev, currentConfig]);
            setSimpleCurrentIndex(prev => prev + 1);
            // Reset simple inputs for next radar (but keep No of Radars)
            setSimpleBox({
                frequency: "",
                pulse_width: "",
                pri: "",
                amplitude: "",
                doa_az: "",
                doa_el: ""
            });
        } else {
            // ACTION: GENERATE (Last Radar)
            const finalRadars = [...simpleRadars, currentConfig];
            await generatePayload(finalRadars);

            // Allow reset?
            // Resetting for next batch
            setSimpleRadars([]);
            setSimpleCurrentIndex(0);
            setSimpleTotalRadars("");
            setSimpleBox({
                frequency: "",
                pulse_width: "",
                pri: "",
                amplitude: "",
                doa_az: "",
                doa_el: ""
            });
        }
    };

    const generatePayload = async (radars: RadarConfig[]) => {
        setLoading(true);
        const payload = {
            radars: radars,
            shuffle: formData.shuffle
        };

        try {
            const response = await fetch('http://localhost:8000/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'Generation failed');
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `radar_data_simple_${Date.now()}.xlsx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (error: any) {
            console.error(error);
            alert(error.message);
        } finally {
            setLoading(false);
        }
    }

    const processDefaults = (data: FormData): any => {
        const processed: any = { ...data };
        if (processed.toa_initial === "") processed.toa_initial = 0;

        Object.keys(LIMITS).forEach((key) => {
            const category = key as keyof typeof LIMITS;
            const param = { ...data[category as keyof FormData] as RadarParam };
            const limit = LIMITS[category];

            if (param.min_val === "") param.min_val = limit.min;
            if (param.max_val === "") param.max_val = limit.max;
            if (param.step === "") {
                const range = (param.max_val as number) - (param.min_val as number);
                // Default to 3 points (Min, Mid, Max) -> range / 2. 
                param.step = range > 0 ? range / 2 : 1;
            }
            if (param.variance === "") param.variance = 0;
            if (param.count === "") param.count = 1;

            processed[category] = param;
        });
        return processed;
    };

    const getParamStatus = (param: RadarParam): "EMPTY" | "PARTIAL" | "FULL" => {
        const fields = [param.min_val, param.max_val, param.step, param.variance, param.count];
        const emptyCount = fields.filter(f => f === "").length;

        if (emptyCount === 5) return "EMPTY";
        if (emptyCount === 0) return "FULL";
        return "PARTIAL";
    };

    const getStrictValidationErrors = (data: FormData): string | null => {
        // Check for PARTIAL fields
        for (const key of Object.keys(LIMITS)) {
            const category = key as keyof typeof LIMITS;
            const param = data[category as keyof FormData] as RadarParam;

            const status = getParamStatus(param);
            if (status === "PARTIAL") {
                const label = category.toUpperCase().replace('_', ' ');
                // Find specifically what is missing for better UX? or just generic "Incomplete"
                return `${label} is incomplete. Please fill all fields or leave entirely empty.`;
            }
        }
        return null;
    };

    const createEmptyParam = (): RadarParam => {
        // Send NULLs/Empty logic to backend (backend now accepts Optional fields)
        return {
            min_val: null as any,
            max_val: null as any,
            step: null as any,
            variance: null as any,
            count: 1
        };
    };

    const handleGridSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const hasErrors = Object.values(errors).some(msg => msg !== "");
        if (hasErrors) {
            alert("Please fix validation errors (red fields) before generating.");
            return;
        }

        let gridConfig: RadarConfig = { ...initialData } as any; // Temporary cast

        // Strict Validation (Always check for partials if OFF, or even ON? User said "when auto fill is off... if incomplete throw error".
        // Actually, if Auto Fill is ON, we usually fill the rest. But "Partial" is ambiguous for auto-fill.
        // Usually Auto Fill fills *Empty* fields. Filling *Partial* fields is risky (which default to use?).
        // Let's enforce NO PARTIALS regardless of Toggle, or only when OFF?
        // User: "when the auto fill is off... throw an error". 
        // Implies when ON, maybe it fills partials? `processDefaults` fills *each field* individually.
        // So existing `processDefaults` handles partials by filling missing slots with defaults.
        // So we only validate partials when OFF.

        if (!autoFill) {
            const errorMsg = getStrictValidationErrors(formData);
            if (errorMsg) {
                alert(`Auto Fill is OFF. ${errorMsg}`);
                return;
            }
        }

        // Construction
        const processed: any = { ...formData };
        if (processed.toa_initial === "") processed.toa_initial = 0;

        Object.keys(LIMITS).forEach((key) => {
            const category = key as keyof typeof LIMITS;
            const param = formData[category as keyof FormData] as RadarParam;
            const status = getParamStatus(param);

            if (!autoFill) {
                // OFF: Full -> User, Empty -> Static Default
                if (status === "EMPTY") {
                    processed[category] = createEmptyParam();
                } else {
                    // FULL (Validated above)
                    processed[category] = param;
                }
            } else {
                // ON: Process Defaults (handles Partials and Empties with Sweeps)
                const limit = LIMITS[category];
                const newParam = { ...param };

                if (newParam.min_val === "") newParam.min_val = limit.min;
                if (newParam.max_val === "") newParam.max_val = limit.max;
                if (newParam.step === "") {
                    const range = (newParam.max_val as number) - (newParam.min_val as number);
                    newParam.step = range > 0 ? range / 2 : 1;
                }
                if (newParam.variance === "") newParam.variance = 0;
                if (newParam.count === "") newParam.count = 1;

                processed[category] = newParam;
            }
        });

        gridConfig = processed;
        await generatePayload([gridConfig]);
    };

    return (
        <div className="flex flex-col xl:flex-row gap-8 w-full items-start">

            {/* LEFT: Main Grid */}
            <form onSubmit={handleGridSubmit} className="flex-1 w-full order-2 xl:order-1">
                {/* 3x2 Grid Layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-8 mb-12">
                    {[
                        { label: 'FREQUENCY', unit: 'MHz', id: 'frequency', color: 'text-blue-400', border: 'border-blue-500/30' },
                        { label: 'PULSE WIDTH', unit: 'µs', id: 'pulse_width', color: 'text-emerald-400', border: 'border-emerald-500/30' },
                        { label: 'PRI - PULSE REPITITION INTERVAL', unit: 'µs', id: 'pri', color: 'text-violet-400', border: 'border-violet-500/30' },
                        { label: 'AMPLITUDE', unit: 'dBm', id: 'amplitude', color: 'text-amber-400', border: 'border-amber-500/30' },
                        { label: 'DOA AZIMUTHAL', unit: 'deg', id: 'doa_az', color: 'text-rose-400', border: 'border-rose-500/30' },
                        { label: 'DOA ELEVATION', unit: 'deg', id: 'doa_el', color: 'text-cyan-400', border: 'border-cyan-500/30' },
                    ].map((row) => {
                        const category = row.id as keyof FormData;
                        const data = formData[category] as RadarParam;

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
                                    {LIMITS[category] && (
                                        <div className="flex flex-col gap-1 text-[10px] text-slate-500 font-mono mt-2">
                                            <span>Range: <span className="text-slate-300 font-bold">[{LIMITS[category].min} - {LIMITS[category].max}]</span></span>
                                            <span>Variance Max: <span className="text-slate-300 font-bold">{LIMITS[category].varMax}</span></span>
                                        </div>
                                    )}
                                </div>

                                {/* Inputs Grid */}
                                <div className="space-y-3 flex-grow">
                                    {[
                                        { label: 'Min', field: 'min_val', placeholder: LIMITS[category]?.min },
                                        { label: 'Max', field: 'max_val', placeholder: LIMITS[category]?.max },
                                        { label: 'Step', field: 'step', placeholder: '1' },
                                        { label: 'Variance', field: 'variance', placeholder: '0' },
                                        { label: 'Count', field: 'count', placeholder: '1' },
                                    ].map(({ label, field, placeholder }) => {
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
                                                        value={data[field as keyof RadarParam]}
                                                        onChange={(e) => handleChange(category, field as any, e.target.value)}
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
                                onChange={(e) => handleChange("toa_initial", "val", e.target.value)}
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
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => handleChange("shuffle", "checked", !formData.shuffle)}>
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

                    {[
                        { label: 'Frequency', id: 'frequency' },
                        { label: 'Pulse Width', id: 'pulse_width' },
                        { label: 'PRI', id: 'pri' },
                        { label: 'Amplitude', id: 'amplitude' },
                        { label: 'DOA Az', id: 'doa_az' },
                        { label: 'DOA El', id: 'doa_el' },
                    ].map((field) => (
                        <div key={field.id} className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-slate-400 uppercase">{field.label}</label>
                            <input
                                type="number"
                                className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-white/40 transition-colors placeholder-slate-600"
                                placeholder="0"
                                value={simpleBox[field.id as keyof typeof simpleBox]}
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
