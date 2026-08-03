"use client";

import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
    Chart as ChartJS,
    LinearScale, PointElement, LineElement, Tooltip, Legend
} from 'chart.js';
import { Scatter } from 'react-chartjs-2';

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend);

if (typeof window !== 'undefined') {
    import('chartjs-plugin-zoom').then((plugin) => {
        ChartJS.register(plugin.default);
    });
}

// ... (existing code)

// ... (existing code, removed corruption)

// Predefined colors for distinct files
const FILE_COLORS = [
    '#38bdf8', // Sky-400 (Theme)
    '#f472b6', // Pink-400
    '#a78bfa', // Violet-400
    '#34d399', // Emerald-400
    '#fbbf24', // Amber-400
    '#f87171', // Red-400
];

interface Dataset {
    id: string;
    filename: string;
    data: any[];
    columns: string[];
    color: string;
    fileUrl?: string; // For downloading/opening the file
}

// Custom Plugin for Limit Lines
const limitLinesPlugin = {
    id: 'limitLines',
    afterDatasetsDraw(chart: any, args: any, options: any) {
        if (options.enabled === false) return;

        const { ctx, chartArea: { left, right }, scales: { y } } = chart;

        const minLimit = options.minLimit;
        const maxLimit = options.maxLimit;

        ctx.save();
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);

        if (minLimit !== '' && minLimit !== undefined && !isNaN(Number(minLimit))) {
            const yVal = Number(minLimit);
            const yPos = y.getPixelForValue(yVal);

            ctx.strokeStyle = '#ef4444'; // Red-500
            ctx.beginPath();
            ctx.moveTo(left, yPos);
            ctx.lineTo(right, yPos);
            ctx.stroke();
        }

        if (maxLimit !== '' && maxLimit !== undefined && !isNaN(Number(maxLimit))) {
            const yVal = Number(maxLimit);
            const yPos = y.getPixelForValue(yVal);

            ctx.strokeStyle = '#22c55e'; // Green-500
            ctx.beginPath();
            ctx.moveTo(left, yPos);
            ctx.lineTo(right, yPos);
            ctx.stroke();
        }

        ctx.restore();
    }
};

type WorkspaceState = {
    datasets: Dataset[];
    selectedColumns: string[];
    zoomSettings: Record<string, { minX: string, maxX: string, minY: string, maxY: string }>;
    isSyncZoom: boolean;
};

export default function VisualizerWorkspace() {
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

    // Selection State
    const [selectedChart, setSelectedChart] = useState<string | null>(null);

    // Full Screen / Maximize State
    const [isMaximized, setIsMaximized] = useState(false);

    // Per-Chart Zoom Settings
    const [zoomSettings, setZoomSettings] = useState<Record<string, { minX: string, maxX: string, minY: string, maxY: string }>>({});

    // Per-Chart Limit Settings
    const [limitSettings, setLimitSettings] = useState<Record<string, { minLimit: string, maxLimit: string, enabled: boolean }>>({});

    // Sync Hover State
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
    const chartRefs = useRef<Record<string, any>>({});

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isSyncZoom, setIsSyncZoom] = useState(false);

    // History State
    const [pastStates, setPastStates] = useState<WorkspaceState[]>([]);
    const [futureStates, setFutureStates] = useState<WorkspaceState[]>([]);

    const saveState = useCallback(() => {
        setPastStates(prev => {
            const newState = { datasets, selectedColumns, zoomSettings, isSyncZoom };
            // Optional: limit history size to 50
            const updated = [...prev, newState];
            return updated.length > 50 ? updated.slice(updated.length - 50) : updated;
        });
        setFutureStates([]);
    }, [datasets, selectedColumns, zoomSettings, isSyncZoom]);

    const undo = useCallback(() => {
        if (pastStates.length === 0) return;
        const previousState = pastStates[pastStates.length - 1];
        setPastStates(prev => prev.slice(0, prev.length - 1));
        setFutureStates(prev => [{ datasets, selectedColumns, zoomSettings, isSyncZoom }, ...prev]);
        
        setDatasets(previousState.datasets);
        setSelectedColumns(previousState.selectedColumns);
        setZoomSettings(previousState.zoomSettings);
        setIsSyncZoom(previousState.isSyncZoom);
    }, [pastStates, datasets, selectedColumns, zoomSettings, isSyncZoom]);

    const redo = useCallback(() => {
        if (futureStates.length === 0) return;
        const nextState = futureStates[0];
        setFutureStates(prev => prev.slice(1));
        setPastStates(prev => [...prev, { datasets, selectedColumns, zoomSettings, isSyncZoom }]);
        
        setDatasets(nextState.datasets);
        setSelectedColumns(nextState.selectedColumns);
        setZoomSettings(nextState.zoomSettings);
        setIsSyncZoom(nextState.isSyncZoom);
    }, [futureStates, datasets, selectedColumns, zoomSettings, isSyncZoom]);

    const CHARTS_PER_PAGE = 3;
    const totalPages = Math.ceil(selectedColumns.length / CHARTS_PER_PAGE) || 1;

    if (currentPage > totalPages && totalPages > 0) {
        setCurrentPage(totalPages);
    }

    const paginatedColumns = selectedColumns.slice(
        (currentPage - 1) * CHARTS_PER_PAGE,
        currentPage * CHARTS_PER_PAGE
    );

    const allColumns = useMemo(() => {
        const cols = new Set<string>();
        datasets.forEach(d => d.columns.forEach(c => cols.add(c)));
        return Array.from(cols); // Removed sort() to preserve excel order
    }, [datasets]);

    // Effect: Sync Tooltips across charts
    useEffect(() => {
        if (!isSyncZoom) return;

        Object.entries(chartRefs.current).forEach(([col, chart]) => {
            if (!chart || chart.destroyed || !chart.canvas) return;

            // If no index is hovered, clear highlights
            if (hoveredIndex === null) {
                chart.tooltip.setActiveElements([], { x: 0, y: 0 });
                chart.setActiveElements([]);
                chart.update('none');
                return;
            }

            // Find dataset index for this column (assuming 1 dataset per scatter for now, or match index)
            // Our seriesDatasets map data to {x: index, y: value}.
            // We want to highlight the point where x === hoveredIndex.

            const datasetIndex = 0; // We typically have one visible dataset per chart in this setup?
            // Actually renderChart creates multiple datasets if multiple files have this column.
            // But let's assume we want to highlight all points at this X across all datasets in this chart.

            const activeElements: any[] = [];

            chart.data.datasets.forEach((dataset: any, dIndex: number) => {
                // Find the data point with x === hoveredIndex
                // Since data is sorted by index (it's 1-based index), we might just look it up.
                // data is {x, y}. 
                // data array index might correspond to (hoveredIndex - 1) if contiguous?
                // Let's search to be safe or map if slow. Since it's scatter, linear search is okay for small N, 
                // but optimization: data[hoveredIndex - 1] might work if index is truly just 1..N

                // Fast lookup assuming data[i].x == i + 1
                const point = dataset.data.find((d: any) => d.x === hoveredIndex);
                if (point) {
                    // We need the internal Chart.js element index.
                    // Chart.js stores parsed data. We need to find the element index.
                    // For 'scatter', dataset.data matches meta.data?

                    const meta = chart.getDatasetMeta(dIndex);
                    // Find index in meta.data that has parsed.x == hoveredIndex
                    // This can be internal index.

                    // Actually, 'dataset.data' passed to chart properties might be different from internal '_parsed'.
                    // Use interaction mode logic or simple index matching if valid.

                    // Optimization: If we trust x is the array index + 1:
                    const internalIndex = point.x - 1; // Assuming 0-based array and 1-based IDs
                    if (meta.data[internalIndex]) {
                        activeElements.push({ datasetIndex: dIndex, index: internalIndex });
                    }
                }
            });

            if (activeElements.length > 0) {
                chart.tooltip.setActiveElements(activeElements, { x: 0, y: 0 }); // Coords ignored for programmatic
                chart.setActiveElements(activeElements);
                chart.update('none'); // Update visual style without full re-render
            }
        });

    }, [hoveredIndex, isSyncZoom]);

    // Handle Escape key to exit maximize
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsMaximized(false);
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (files.length === 0) return;

        event.target.value = '';
        setIsUploading(true);

        try {
            const uploadPromises = files.map(async (file) => {
                const fileUrl = URL.createObjectURL(file);
                const formData = new FormData();
                formData.append('file', file);

                const response = await fetch('http://localhost:8000/visualize/upload', {
                    method: 'POST',
                    body: formData,
                });

                if (!response.ok) {
                    throw new Error(`Upload failed for ${file.name}`);
                }

                const result = await response.json();
                if (result.error) {
                    throw new Error(result.error);
                }

                const chartData = result.data.map((item: any, index: number) => ({
                    ...item,
                    index: index + 1
                }));

                return {
                    id: Math.random().toString(36).substr(2, 9),
                    filename: result.filename,
                    data: chartData,
                    columns: result.columns,
                    fileUrl: fileUrl
                };
            });

            const results = await Promise.all(uploadPromises);
            
            saveState();
            setDatasets(prev => {
                const newDatasets = results.map((result, i) => ({
                    ...result,
                    color: FILE_COLORS[(prev.length + i) % FILE_COLORS.length],
                }));
                return [...prev, ...newDatasets];
            });

            if (datasets.length === 0 && results.length > 0) {
                setSelectedColumns([]);
            }
        } catch (error: any) {
            console.error('Error uploading files:', error);
            alert('Failed to upload files: ' + error.message);
        } finally {
            setIsUploading(false);
        }
    };

    const removeDataset = (id: string, fileUrl?: string) => {
        // Clean up object URL if using one
        if (fileUrl) URL.revokeObjectURL(fileUrl);
        saveState();
        setDatasets(prev => prev.filter(d => d.id !== id));
    };

    const toggleColumn = (col: string) => {
        saveState();
        setSelectedColumns(prev => {
            const newState = prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col];
            return newState;
        });
    };

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    const clearAll = () => {
        if (!confirm('Are you sure you want to remove all files?')) return;
        datasets.forEach(ds => {
            if (ds.fileUrl) URL.revokeObjectURL(ds.fileUrl);
        });
        saveState();
        setDatasets([]);
        setSelectedColumns([]);
        setCurrentPage(1);
        setSelectedChart(null);
        setZoomSettings({});
        setLimitSettings({});
        setIsMaximized(false);
    };

    const resetAllCharts = () => {
        saveState();
        setZoomSettings({});
        setLimitSettings({});
    };

    const downloadSnapshot = () => {
        if (!selectedChart) {
            alert("Please select a chart by clicking on it first.");
            return;
        }

        const canvas = document.getElementById(`chart-canvas-${selectedChart}`) as HTMLCanvasElement;
        if (canvas) {
            const image = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.href = image;
            link.download = `${selectedChart}_snapshot.png`;
            link.click();
        } else {
            console.error("Canvas element not found");
            alert("Could not capture snapshot. Please try again.");
        }
    };

    const handlePageChange = (page: number) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
        }
    };

    // Zoom Helpers
    const updateZoom = (field: 'minX' | 'maxX' | 'minY' | 'maxY', value: string) => {
        if (!selectedChart) return;
        saveState();
        setZoomSettings(prev => ({
            ...prev,
            [selectedChart]: {
                ...(prev[selectedChart] || { minX: '', maxX: '', minY: '', maxY: '' }),
                [field]: value
            }
        }));
    };

    const currentZoom = selectedChart ? (zoomSettings[selectedChart] || { minX: '', maxX: '', minY: '', maxY: '' }) : { minX: '', maxX: '', minY: '', maxY: '' };

    // Limit Helpers
    const updateLimit = (field: 'minLimit' | 'maxLimit' | 'enabled', value: string | boolean) => {
        if (!selectedChart) return;
        setLimitSettings(prev => ({
            ...prev,
            [selectedChart]: {
                ...(prev[selectedChart] || { minLimit: '', maxLimit: '', enabled: true }),
                [field]: value
            }
        }));
    };

    const currentLimit = selectedChart ? (limitSettings[selectedChart] || { minLimit: '', maxLimit: '', enabled: true }) : { minLimit: '', maxLimit: '', enabled: true };

    const renderChart = (col: string, isFullSize: boolean = false) => {
        const seriesDatasets = datasets.filter(ds => ds.columns.includes(col)).map(ds => ({
            label: ds.filename,
            data: ds.data.map(d => ({ x: d.index, y: d[col] })),
            backgroundColor: ds.color,
            borderColor: ds.color,
            borderWidth: 0,
            pointRadius: isFullSize ? 3 : 2.5,
            pointHoverRadius: 5,
            showLine: false,
        }));

        if (seriesDatasets.length === 0) return null;

        const chartData = { datasets: seriesDatasets };

        const zoomConfig = zoomSettings[col] || { minX: '', maxX: '', minY: '', maxY: '' };
        const limitConfig = limitSettings[col] || { minLimit: '', maxLimit: '', enabled: true };

        // Calculate Visible Points
        let visiblePoints = 0;
        const xMin = zoomConfig.minX !== '' ? Number(zoomConfig.minX) : -Infinity;
        const xMax = zoomConfig.maxX !== '' ? Number(zoomConfig.maxX) : Infinity;
        const yMin = zoomConfig.minY !== '' ? Number(zoomConfig.minY) : -Infinity;
        const yMax = zoomConfig.maxY !== '' ? Number(zoomConfig.maxY) : Infinity;

        seriesDatasets.forEach(ds => {
            ds.data.forEach(d => {
                if (d.x >= xMin && d.x <= xMax && d.y >= yMin && d.y <= yMax) {
                    visiblePoints++;
                }
            });
        });

        const options: any = {
            responsive: true,
            maintainAspectRatio: false,
            animation: false as const,
            onHover: (e: any, elements: any[], chart: any) => {
                if (!isSyncZoom) return;

                if (elements && elements.length > 0) {
                    const first = elements[0];
                    const datasetIndex = first.datasetIndex;
                    const dataIndex = first.index;
                    const point = chart.data.datasets[datasetIndex].data[dataIndex];

                    if (point && point.x !== hoveredIndex) {
                        setHoveredIndex(point.x);
                    }
                } else {
                    if (hoveredIndex !== null) {
                        setHoveredIndex(null);
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'xy',
                intersect: true
            },
            scales: {
                x: {
                    type: 'linear' as const,
                    position: 'bottom' as const,
                    min: zoomConfig.minX !== '' ? Number(zoomConfig.minX) : undefined,
                    max: zoomConfig.maxX !== '' ? Number(zoomConfig.maxX) : undefined,
                    grid: { color: '#334155', drawBorder: false },
                    ticks: { color: '#94a3b8', font: { size: 10 } },
                    title: { display: true, text: 'Index', color: '#64748b', font: { size: 10 } }
                },
                y: {
                    min: zoomConfig.minY !== '' ? Number(zoomConfig.minY) : undefined,
                    max: zoomConfig.maxY !== '' ? Number(zoomConfig.maxY) : undefined,
                    grid: { color: '#334155', drawBorder: false },
                    ticks: { color: '#94a3b8', font: { size: 10 } },
                    title: { display: true, text: col, color: '#64748b', font: { size: 10 } }
                },
            },
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false },
                limitLines: limitConfig,
                zoom: {
                    zoom: {
                        wheel: { enabled: false },
                        pinch: { enabled: false },
                        drag: {
                            enabled: selectedChart === col,
                            borderColor: '#0ea5e9', // Sky-500
                            borderWidth: 1,
                            backgroundColor: 'rgba(14, 165, 233, 0.3)',
                        },
                        mode: 'xy',
                        onZoomComplete: ({ chart }: any) => {
                            const { min: xMin, max: xMax } = chart.scales.x;
                            const { min: yMin, max: yMax } = chart.scales.y;

                            saveState();
                            setZoomSettings(prev => {
                                const newSettings = { ...prev };

                                // Update Active Chart
                                newSettings[col] = { minX: String(xMin), maxX: String(xMax), minY: String(yMin), maxY: String(yMax) };

                                // If Sync Mode is ON, update X-axis for all other loaded columns
                                if (isSyncZoom) {
                                    allColumns.forEach(c => {
                                        if (c !== col) {
                                            const existing = newSettings[c] || { minX: '', maxX: '', minY: '', maxY: '' };
                                            newSettings[c] = {
                                                ...existing,
                                                minX: String(xMin),
                                                maxX: String(xMax)
                                                // Keep existing Y
                                            };
                                        }
                                    });
                                }

                                return newSettings;
                            });
                        }
                    },
                    pan: {
                        enabled: selectedChart === col,
                        modifierKey: 'shift', // User requested Right Click, but library limits this. Using Shift as stable alternative.
                        mode: 'xy',
                        onPanComplete: ({ chart }: any) => {
                            const { min: xMin, max: xMax } = chart.scales.x;
                            const { min: yMin, max: yMax } = chart.scales.y;

                            setZoomSettings(prev => {
                                const newSettings = { ...prev };

                                // Update Active Chart
                                newSettings[col] = { minX: String(xMin), maxX: String(xMax), minY: String(yMin), maxY: String(yMax) };

                                // If Sync Mode is ON, update X-axis for all other loaded columns
                                if (isSyncZoom) {
                                    allColumns.forEach(c => {
                                        if (c !== col) {
                                            const existing = newSettings[c] || { minX: '', maxX: '', minY: '', maxY: '' };
                                            newSettings[c] = {
                                                ...existing,
                                                minX: String(xMin),
                                                maxX: String(xMax)
                                                // Keep existing Y
                                            };
                                        }
                                    });
                                }

                                return newSettings;
                            });
                        }
                    }
                }
            }
        };

        const isSelected = selectedChart === col;

        return (
            <div
                key={col}
                onClick={() => !isFullSize && setSelectedChart(col)
                }
                onContextMenu={(e) => e.preventDefault()}
                onDoubleClick={() => {
                    saveState();
                    setZoomSettings(prev => {
                        const next = { ...prev };

                        // Reset active chart
                        delete next[col];

                        // If Sync Zoom is enabled, reset X-axis for ALL other charts too
                        if (isSyncZoom) {
                            allColumns.forEach(c => {
                                if (c !== col) {
                                    const existing = next[c] || { minX: '', maxX: '', minY: '', maxY: '' };
                                    next[c] = {
                                        ...existing,
                                        minX: '', // Reset X
                                        maxX: ''  // Reset X
                                    };
                                }
                            });
                        }

                        return next;
                    });
                }}
                className={`
                    flex flex-col cursor-pointer transition-all border
                    ${isFullSize
                        ? 'h-full w-full bg-slate-900 rounded-none p-6 border-none'
                        : `
                            ${paginatedColumns.length === 1 ? 'h-full' : paginatedColumns.length === 2 ? 'h-[48%]' : 'h-[32%]'} 
                            rounded-xl p-4 shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-500
                            ${isSelected
                            ? 'bg-slate-900 border-sky-500 ring-1 ring-sky-500/50 shadow-sky-900/20'
                            : 'bg-slate-900/50 border-white/5 hover:bg-slate-800/50 hover:border-white/10'
                        }
                        `
                    }
                `}
            >
                <div className="flex items-center justify-between mb-2 border-b border-white/5 pb-2 shrink-0">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isSelected || isFullSize ? 'bg-sky-500 animate-pulse' : 'bg-slate-700'}`}></div>
                        <h3 className={`text-sm font-bold uppercase tracking-wider ${isSelected || isFullSize ? 'text-sky-400' : 'text-slate-400'}`}>{col}</h3>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                        {visiblePoints.toLocaleString()} points
                    </span>
                </div>

                <div className="flex-1 w-full relative min-h-0">
                    <Scatter
                        ref={(ref) => {
                            if (ref) {
                                chartRefs.current[col] = ref;
                            } else {
                                delete chartRefs.current[col];
                            }
                        }}
                        id={`chart-canvas-${col}`}
                        data={chartData}
                        options={options}
                        plugins={[limitLinesPlugin]}
                    />
                </div>
            </div >
        );
    };

    return (
        <div className="flex h-full w-full bg-slate-900 text-slate-200 font-sans overflow-hidden">

            {/* 1. Secondary Sidebar (Left, Full Height) */}
            <aside className="w-[200px] shrink-0 bg-slate-900 border-r border-white/5 flex flex-col z-20">
                <div className="h-[60px] flex items-center px-4 justify-between">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Data Sources</h3>
                    {datasets.length > 0 && (
                        <button
                            onClick={clearAll}
                            className="text-[10px] text-red-400 hover:text-red-300 uppercase tracking-wider font-bold"
                        >
                            Clear All
                        </button>
                    )}
                </div>

                {/* Navigation / History Buttons */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-slate-800/30">
                    <button 
                        onClick={undo}
                        disabled={pastStates.length === 0}
                        className="p-1.5 rounded hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-slate-400 hover:text-sky-400"
                        title="Undo (Back)"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                    </button>
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">History</span>
                    <button 
                        onClick={redo}
                        disabled={futureStates.length === 0}
                        className="p-1.5 rounded hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-slate-400 hover:text-sky-400"
                        title="Redo (Front)"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                    </button>
                </div>

                <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
                    {/* Upload New File Button */}
                    <div
                        onClick={triggerFileInput}
                        className={`mb-6 border-2 border-dashed border-white/10 rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all group ${isUploading ? 'opacity-50 pointer-events-none' : 'hover:border-sky-500/50 hover:bg-sky-500/5'}`}
                    >
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            accept=".xlsx, .xls, .csv"
                            className="hidden"
                            multiple
                        />
                        <div className="size-8 rounded-full bg-slate-800 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                            {isUploading ? (
                                <svg className="animate-spin w-4 h-4 text-sky-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            ) : (
                                <svg className="w-4 h-4 text-slate-400 group-hover:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                            )}
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            {isUploading ? 'Uploading...' : 'Add File'}
                        </p>
                    </div>

                    {/* Active Files List */}
                    {datasets.length > 0 && (
                        <div className="mb-6 space-y-2">
                            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Active Files</h4>
                            {datasets.map(ds => (
                                <div key={ds.id} className="flex items-center justify-between p-2 bg-slate-800/50 rounded border border-white/5 group hover:border-white/10">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ds.color }}></div>
                                        <a
                                            href={ds.fileUrl}
                                            download={ds.filename}
                                            className="text-xs text-slate-300 truncate hover:text-sky-400 hover:underline cursor-pointer transition-colors"
                                            title={`Download and Open ${ds.filename}`}
                                            onClick={(e) => {
                                                // If no fileUrl (old data?), don't navigate
                                                if (!ds.fileUrl) e.preventDefault();
                                            }}
                                        >
                                            {ds.filename}
                                        </a>
                                    </div>
                                    <button onClick={() => removeDataset(ds.id, ds.fileUrl)} className="text-slate-600 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Column Selection Section */}
                    {datasets.length > 0 && (
                        <div className="animate-in fade-in slide-in-from-left-4 duration-500">
                            <div className="flex items-center justify-between mb-2">
                                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Parameters</h4>
                                <div className="flex gap-2">
                                    <button onClick={() => { saveState(); setSelectedColumns(allColumns); }} className="text-[10px] text-sky-500 hover:text-sky-400">All</button>
                                    <button onClick={() => { saveState(); setSelectedColumns([]); }} className="text-[10px] text-slate-500 hover:text-slate-400">None</button>
                                </div>
                            </div>

                            <div className="space-y-1 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {allColumns.map((col) => (
                                    <label key={col} className="flex items-center gap-3 p-2 rounded hover:bg-white/5 cursor-pointer group transition-colors">
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${selectedColumns.includes(col) ? 'bg-sky-500 border-sky-500' : 'border-slate-600 group-hover:border-slate-400'}`}>
                                            {selectedColumns.includes(col) && (
                                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                            )}
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={selectedColumns.includes(col)}
                                            onChange={() => toggleColumn(col)}
                                            className="hidden"
                                        />
                                        <span className={`text-xs ${selectedColumns.includes(col) ? 'text-sky-300 font-bold' : 'text-slate-400'}`}>{col}</span>
                                    </label>
                                ))}
                            </div>
                            {/* Snapshot Button */}
                            <button
                                onClick={downloadSnapshot}
                                disabled={!selectedChart}
                                className="mt-6 w-full py-2 bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 text-[10px] font-bold uppercase tracking-wider rounded border border-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 group"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                                Snapshot
                            </button>
                        </div>
                    )}
                </div>
            </aside>

            {/* 2. Second Sidebar (Chart Controls) */}
            <aside className="w-[140px] shrink-0 bg-slate-900 border-r border-white/5 flex flex-col z-20 overflow-y-auto custom-scrollbar p-3 gap-4">
                <div className="flex items-center justify-between mb-1 border-b border-white/5 pb-2">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-tight">Chart Controls</h3>
                </div>

                {/* Zoom Internal Controls */}
                <fieldset className={`border ${selectedChart ? 'border-sky-500/50' : 'border-white/10 opacity-50'} rounded-[4px] px-2 pb-3 pt-2 flex flex-col gap-2 group hover:border-white/20 transition-all`}>
                    <legend className={`px-1 text-[9px] font-bold uppercase tracking-wider ${selectedChart ? 'text-sky-400' : 'text-slate-600'}`}>
                        {selectedChart ? `Zoom` : 'Select Chart'}
                    </legend>
                    <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Min X</label>
                        <input
                            type="number"
                            value={currentZoom.minX}
                            onChange={(e) => updateZoom('minX', e.target.value)}
                            disabled={!selectedChart}
                            className="w-full h-6 bg-slate-800 border border-white/10 rounded-[2px] px-2 text-[10px] text-white focus:border-sky-500 focus:outline-none placeholder-slate-600 text-right disabled:opacity-50 disabled:cursor-not-allowed"
                            placeholder="Auto"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Max X</label>
                        <input
                            type="number"
                            value={currentZoom.maxX}
                            onChange={(e) => updateZoom('maxX', e.target.value)}
                            disabled={!selectedChart}
                            className="w-full h-6 bg-slate-800 border border-white/10 rounded-[2px] px-2 text-[10px] text-white focus:border-sky-500 focus:outline-none placeholder-slate-600 text-right disabled:opacity-50 disabled:cursor-not-allowed"
                            placeholder="Auto"
                        />
                    </div>
                    <div className="w-full h-px bg-white/10 my-1"></div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Min Y</label>
                        <input
                            type="number"
                            value={currentZoom.minY}
                            onChange={(e) => updateZoom('minY', e.target.value)}
                            disabled={!selectedChart}
                            className="w-full h-6 bg-slate-800 border border-white/10 rounded-[2px] px-2 text-[10px] text-white focus:border-sky-500 focus:outline-none placeholder-slate-600 text-right disabled:opacity-50 disabled:cursor-not-allowed"
                            placeholder="Auto"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Max Y</label>
                        <input
                            type="number"
                            value={currentZoom.maxY}
                            onChange={(e) => updateZoom('maxY', e.target.value)}
                            disabled={!selectedChart}
                            className="w-full h-6 bg-slate-800 border border-white/10 rounded-[2px] px-2 text-[10px] text-white focus:border-sky-500 focus:outline-none placeholder-slate-600 text-right disabled:opacity-50 disabled:cursor-not-allowed"
                            placeholder="Auto"
                        />
                    </div>
                </fieldset>

                {/* Limit Lines Internal Controls */}
                <fieldset className={`border ${selectedChart ? 'border-sky-500/50' : 'border-white/10 opacity-50'} rounded-[4px] px-2 pb-3 pt-2 flex flex-col gap-2 group hover:border-white/20 transition-all`}>
                    <legend className={`px-1 text-[9px] font-bold uppercase tracking-wider ${selectedChart ? 'text-sky-400' : 'text-slate-600'}`}>
                        {selectedChart ? `Limits` : 'Select Chart'}
                    </legend>
                    <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">{currentLimit.enabled ? 'Hide' : 'Show'}</span>
                        <button
                            onClick={() => updateLimit('enabled', !currentLimit.enabled)}
                            disabled={!selectedChart}
                            className={`w-8 h-4 rounded-full p-0.5 flex items-center transition-colors ${currentLimit.enabled ? 'bg-sky-500' : 'bg-slate-700'} disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            <div className={`w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${currentLimit.enabled ? 'translate-x-full' : 'translate-x-0'}`}></div>
                        </button>
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Min L</label>
                        <input
                            type="number"
                            value={currentLimit.minLimit}
                            onChange={(e) => updateLimit('minLimit', e.target.value)}
                            disabled={!selectedChart || !currentLimit.enabled}
                            className="w-full h-6 bg-slate-800 border border-white/10 rounded-[2px] px-2 text-[10px] text-white focus:border-red-500 focus:outline-none placeholder-slate-600 text-right disabled:opacity-30 disabled:cursor-not-allowed"
                            placeholder="None"
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Max L</label>
                        <input
                            type="number"
                            value={currentLimit.maxLimit}
                            onChange={(e) => updateLimit('maxLimit', e.target.value)}
                            disabled={!selectedChart || !currentLimit.enabled}
                            className="w-full h-6 bg-slate-800 border border-white/10 rounded-[2px] px-2 text-[10px] text-white focus:border-green-500 focus:outline-none placeholder-slate-600 text-right disabled:opacity-30 disabled:cursor-not-allowed"
                            placeholder="None"
                        />
                    </div>
                </fieldset>

                {/* Sync Zoom Toggle */}
                <div className="flex flex-col items-center justify-center gap-2 border border-white/10 rounded-[4px] px-2 py-3 w-full">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Sync Zoom</span>
                    <button
                        disabled={selectedColumns.length === 0}
                        onClick={() => {
                            saveState();
                            const nextState = !isSyncZoom;
                            setIsSyncZoom(nextState);
                            if (nextState && selectedChart) {
                                const activeZoom = zoomSettings[selectedChart];
                                if (activeZoom) {
                                    setZoomSettings(prev => {
                                        const next = { ...prev };
                                        allColumns.forEach(c => {
                                            if (c !== selectedChart) {
                                                const existing = next[c] || { minX: '', maxX: '', minY: '', maxY: '' };
                                                next[c] = {
                                                    ...existing,
                                                    minX: activeZoom.minX,
                                                    maxX: activeZoom.maxX
                                                };
                                            }
                                        });
                                        return next;
                                    });
                                }
                            }
                        }}
                        className={`w-8 h-4 rounded-full p-0.5 flex items-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isSyncZoom ? 'bg-sky-500' : 'bg-slate-700'}`}
                    >
                        <div className={`w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${isSyncZoom ? 'translate-x-full' : 'translate-x-0'}`}></div>
                    </button>
                </div>

                {/* Action Buttons: Maximize & Reset */}
                <div className="flex flex-col gap-2 mt-auto">
                    <button
                        onClick={() => setIsMaximized(true)}
                        disabled={!selectedChart}
                        className="w-full py-2 bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-[4px] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-sky-900/20"
                    >
                        Maximize
                    </button>
                    <button
                        onClick={resetAllCharts}
                        disabled={datasets.length === 0}
                        className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[10px] font-bold uppercase tracking-wider rounded-[4px] disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-white/10"
                    >
                        Reset
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex flex-col flex-1 min-w-0 bg-slate-950">

                {/* 3. Tab Navigation Bar */}
                {totalPages > 1 && (
                    <div className="h-[36px] bg-slate-900 flex items-end px-4 border-b border-white/5 space-x-1 shrink-0">
                        {Array.from({ length: totalPages }).map((_, i) => {
                            const pageNum = i + 1;
                            const isActive = pageNum === currentPage;
                            return (
                                <button
                                    key={pageNum}
                                    onClick={() => handlePageChange(pageNum)}
                                    className={`
                                        relative px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded-t-lg transition-colors
                                        ${isActive
                                            ? 'bg-slate-950 text-sky-400 z-10'
                                            : 'bg-slate-800/50 text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                                        }
                                    `}
                                >
                                    {/* Top Line for Active Tab to pop */}
                                    {isActive && (
                                        <div className="absolute top-0 left-0 right-0 h-[2px] bg-sky-500 rounded-t-lg"></div>
                                    )}
                                    Page {pageNum}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* 3. Main Canvas */}
                <main className="flex-1 bg-slate-950 relative overflow-hidden flex flex-col">
                    {/* Grid Pattern Background */}
                    <div className="absolute inset-0 z-0 opacity-10 pointer-events-none"
                        style={{ backgroundImage: 'radial-gradient(#64748b 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
                    </div>

                    {/* Content Container */}
                    <div className="relative z-10 flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4 h-full">

                        {selectedColumns.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-center space-y-4 min-h-[400px] m-auto">
                                <div className="size-16 mx-auto rounded-full bg-slate-800 flex items-center justify-center border border-white/5">
                                    {datasets.length > 0 ? (
                                        <div className="text-sky-500">
                                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                        </div>
                                    ) : (
                                        <svg className="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                                    )}
                                </div>
                                {datasets.length > 0 ? (
                                    <div>
                                        <h3 className="text-white font-bold text-sm">No Parameters Selected</h3>
                                        <p className="text-slate-500 text-xs mt-1">Check parameters in the sidebar to generate plots.</p>
                                    </div>
                                ) : (
                                    <div>
                                        <h3 className="text-slate-500 font-mono text-sm">Workspace Ready</h3>
                                        <p className="text-slate-600 text-xs max-w-xs mx-auto">
                                            Add files to begin visualizing data.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Paginated Multi-Series Scatter Plots */}
                        {paginatedColumns.map((col) => renderChart(col))}
                    </div>
                </main>

                {/* Full Screen Maximize Modal */}
                {isMaximized && selectedChart && (
                    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col animate-in fade-in duration-200">
                        {/* Modal Header */}
                        <div className="h-[60px] shrink-0 bg-slate-900 border-b border-white/5 flex items-center justify-between px-6">
                            <h2 className="text-lg font-bold text-sky-400 flex items-center gap-3">
                                <span className="text-white/50 text-sm font-normal">MAXIMIZED VIEW</span>
                                {selectedChart}
                            </h2>
                            <button
                                onClick={() => setIsMaximized(false)}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-bold uppercase tracking-wider transition-colors"
                            >
                                Close (Esc)
                            </button>
                        </div>
                        {/* Modal Content */}
                        <div className="flex-1 p-6 overflow-hidden">
                            {renderChart(selectedChart, true)}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
