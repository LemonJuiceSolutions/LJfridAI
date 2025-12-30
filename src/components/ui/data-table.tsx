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
import { ArrowUpDown, ArrowUp, ArrowDown, Filter, X } from "lucide-react"
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
    const pageSize = 10

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

                const comparison = aValue > bValue ? 1 : -1
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
                setSortColumn(null) // toggle off
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

    if (!data || data.length === 0) {
        return <div className="p-4 text-center text-sm text-muted-foreground">Nessun dato da visualizzare.</div>
    }

    return (
        <div className={`space-y-4 ${className} w-full max-w-full`}>
            <div className="rounded-md border max-h-[400px] overflow-auto relative w-full max-w-full">
                <table className="w-max min-w-full caption-bottom text-sm">
                    <TableHeader className="bg-muted/50 sticky top-0 z-10">
                        <TableRow>
                            {columns.map((column) => (
                                <TableHead key={column} className="min-w-[150px] whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-xs uppercase text-muted-foreground">{column}</span>

                                        {/* Sort Button */}
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className={`h-6 w-6 p-0 hover:bg-transparent ${sortColumn === column ? 'text-primary' : 'text-muted-foreground/50'}`}
                                            onClick={() => handleSort(column)}
                                        >
                                            {sortColumn === column ? (
                                                sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                                            ) : (
                                                <ArrowUpDown className="h-3 w-3" />
                                            )}
                                        </Button>

                                        {/* Filter Popover */}
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button variant="ghost" size="sm" className={`h-6 w-6 p-0 hover:bg-transparent ${filters[column] ? 'text-primary' : 'text-muted-foreground/50'}`}>
                                                    <Filter className="h-3 w-3" />
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-60 p-2" align="start">
                                                <div className="space-y-2">
                                                    <h4 className="font-medium leading-none text-xs mb-2">Filtra {column}</h4>
                                                    <div className="flex gap-2">
                                                        <Input
                                                            placeholder={`Cerca in ${column}...`}
                                                            value={filters[column] || ''}
                                                            onChange={(e) => handleFilterChange(column, e.target.value)}
                                                            className="h-8 text-xs"
                                                            autoFocus
                                                        />
                                                        {filters[column] && (
                                                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleFilterChange(column, '')}>
                                                                <X className="h-4 w-4" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            </PopoverContent>
                                        </Popover>

                                    </div>
                                </TableHead>
                            ))}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {paginatedData.length > 0 ? (
                            paginatedData.map((row, i) => (
                                <TableRow key={i}>
                                    {columns.map((column) => (
                                        <TableCell key={column} className="py-2 px-4 text-xs font-mono whitespace-nowrap">
                                            {row[column] !== null && row[column] !== undefined ? String(row[column]) : <span className="text-muted-foreground/40 italic">null</span>}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow>
                                <TableCell colSpan={columns.length} className="h-24 text-center">
                                    Nessun risultato trovato con i filtri correnti.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </table>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div>
                    Pagina {currentPage} di {totalPages} ({filteredData.length} record)
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="h-8 px-2"
                    >
                        Precedente
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="h-8 px-2"
                    >
                        Successivo
                    </Button>
                </div>
            </div>
        </div>
    )
}
