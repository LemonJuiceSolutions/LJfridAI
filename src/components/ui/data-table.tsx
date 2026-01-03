"use client"

import * as React from "react"
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowUpDown, ArrowUp, ArrowDown, Filter, X, Download, ChevronRight } from "lucide-react"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface DataTableProps<TData> {
    data: TData[]
    className?: string
}

export function DataTable<TData extends Record<string, any>>({
    data,
    className,
}: DataTableProps<TData>) {
    const [sortColumn, setSortColumn] = React.useState<keyof TData | null>(null)
    const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('asc')
    const [filters, setFilters] = React.useState<Record<string, string>>({})
    const [currentPage, setCurrentPage] = React.useState(1)
    const pageSize = 50

    const columns = React.useMemo(() => {
        if (!data || data.length === 0) return []
        return Object.keys(data[0])
    }, [data])

    const filteredData = React.useMemo(() => {
        let processData = [...data]

        // 1. Filter
        if (Object.keys(filters).length > 0) {
            processData = processData.filter((row) => {
                return Object.entries(filters).every(([key, value]) => {
                    if (!value) return true
                    const cellValue = String(row[key] || '').toLowerCase()
                    return cellValue.includes(value.toLowerCase())
                })
            })
        }

        // 2. Sort
        if (sortColumn) {
            processData.sort((a, b) => {
                const aValue = a[sortColumn]
                const bValue = b[sortColumn]

                if (aValue === bValue) return 0

                // Better sort for numbers/strings
                const isANumber = typeof aValue === 'number'
                const isBNumber = typeof bValue === 'number'

                if (isANumber && isBNumber) {
                    return sortDirection === 'asc' ? (aValue as number) - (bValue as number) : (bValue as number) - (aValue as number)
                }

                const comparison = String(aValue).localeCompare(String(bValue))
                return sortDirection === 'asc' ? comparison : -comparison
            })
        }

        return processData
    }, [data, filters, sortColumn, sortDirection])

    const paginatedData = React.useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize
        return filteredData.slice(startIndex, startIndex + pageSize)
    }, [filteredData, currentPage])

    const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize))

    React.useEffect(() => {
        setCurrentPage(1)
    }, [filters, sortColumn])

    const handleSort = (column: string) => {
        if (sortColumn === column) {
            if (sortDirection === 'asc') {
                setSortDirection('desc')
            } else {
                setSortColumn(null)
                setSortDirection('asc')
            }
        } else {
            setSortColumn(column)
            setSortDirection('asc')
        }
    }

    const handleFilterChange = (column: string, value: string) => {
        setFilters((prev) => {
            const newFilters = { ...prev }
            if (value) {
                newFilters[column] = value
            } else {
                delete newFilters[column]
            }
            return newFilters
        })
    }

    const downloadExcel = async () => {
        if (filteredData.length === 0) return
        try {
            const response = await fetch('http://localhost:5005/download-excel', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ data: filteredData }),
            })

            if (!response.ok) throw new Error('Download failed')

            const blob = await response.blob()
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.setAttribute('download', 'preview_data.xlsx')
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.URL.revokeObjectURL(url)
        } catch (error) {
            console.error('Excel download error:', error)
            alert('Errore durante il download dell\'Excel')
        }
    }

    if (!data || data.length === 0) {
        return <div className="p-4 text-center text-sm text-muted-foreground italic">Nessun dato da visualizzare.</div>
    }

    return (
        <div className={cn("flex flex-col h-full w-full max-w-full bg-white dark:bg-zinc-900 border rounded-lg overflow-hidden", className)}>
            {/* Top Toolbar */}
            <div className="flex items-center justify-between p-2 bg-muted/30 border-b gap-4">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground px-2 py-1 bg-white dark:bg-zinc-800 rounded border shadow-sm">
                        {filteredData.length} righe
                    </span>
                    {Object.keys(filters).length > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setFilters({})}
                            className="h-7 text-[10px] text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                            <X className="h-3 w-3 mr-1" /> Rimuovi Filtri
                        </Button>
                    )}
                </div>
                <Button variant="outline" size="sm" onClick={downloadExcel} className="h-7 text-[10px] gap-1.5 font-bold">
                    <Download className="h-3 w-3" /> Esporta Excel
                </Button>
            </div>

            {/* Table Container */}
            <div className="flex-1 overflow-auto relative">
                <table className="w-max min-w-full text-sm border-separate border-spacing-0">
                    <thead className="sticky top-0 z-20 bg-muted/80 backdrop-blur-sm">
                        <tr>
                            {columns.map((column) => (
                                <th
                                    key={`head-${column}`}
                                    className="px-4 py-2 border-b border-r last:border-r-0 text-left align-middle transition-colors group cursor-pointer hover:bg-muted/50"
                                    onClick={() => handleSort(column)}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-bold text-[10px] uppercase text-slate-500 dark:text-slate-400 tracking-wider transition-colors group-hover:text-primary">
                                            {column}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            {sortColumn === column ? (
                                                sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />
                                            ) : (
                                                <ArrowUpDown className="h-3 w-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100" />
                                            )}
                                        </div>
                                    </div>
                                </th>
                            ))}
                        </tr>
                        {/* Persistent Filter Row */}
                        <tr className="bg-white/50 dark:bg-zinc-900/50 backdrop-blur shadow-inner">
                            {columns.map((column) => (
                                <th key={`filter-${column}`} className="px-2 py-1.5 border-b border-r last:border-r-0">
                                    <div className="relative">
                                        <Input
                                            placeholder={`Filtra...`}
                                            value={filters[column] || ''}
                                            onChange={(e) => handleFilterChange(column, e.target.value)}
                                            className="h-7 text-[10px] bg-white/30 dark:bg-zinc-900/30 border-none shadow-none focus-visible:ring-1 focus-visible:ring-primary/30 pl-6"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        <Filter className="absolute left-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/40" />
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {paginatedData.length > 0 ? (
                            paginatedData.map((row, i) => (
                                <tr key={i} className="hover:bg-muted/20 transition-colors even:bg-zinc-50/50 dark:even:bg-zinc-800/10">
                                    {columns.map((column) => (
                                        <td key={column} className="py-2 px-4 text-xs font-mono border-r last:border-r-0 text-foreground/80">
                                            {row[column] !== null && row[column] !== undefined ? String(row[column]) : <span className="text-muted-foreground/40 italic">null</span>}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={columns.length} className="h-32 text-center text-muted-foreground italic">
                                    Nessun risultato trovato.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Row */}
            <div className="flex items-center justify-between p-2 bg-muted/40 border-t">
                <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">
                    Pagina {currentPage} di {totalPages}
                </div>
                <div className="flex gap-1">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="h-7 w-7 p-0"
                    >
                        <ChevronRight className="h-4 w-4 rotate-180" />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="h-7 w-7 p-0"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    )
}
