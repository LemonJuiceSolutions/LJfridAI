'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { Button } from '@/components/ui/button';
import {
    Bold, Italic, Underline as UnderlineIcon,
    Heading1, Heading2, List, ListOrdered,
    Table as TableIcon, BarChart3, Palette,
    Undo, Redo, Paperclip, Code
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

export interface EmailBodyEditorRef {
    insertPlaceholder: (type: 'TABELLA' | 'GRAFICO' | 'ALLEGATO' | 'LINK' | 'TRIGGER' | 'VARIABILE', name: string) => void;
}

interface EmailBodyEditorProps {
    value: string;
    onChange: (html: string) => void;
    availableTables?: Array<{ name: string }>;
    availableCharts?: Array<{ name: string }>;
    availableVariables?: Array<{ name: string }>;
    availableAttachments?: Array<{ filename: string; size?: number }>;
    placeholder?: string;
}

const COLORS = [
    '#000000', '#374151', '#6B7280', '#9CA3AF',
    '#DC2626', '#EA580C', '#D97706', '#CA8A04',
    '#16A34A', '#059669', '#0D9488', '#0891B2',
    '#2563EB', '#4F46E5', '#7C3AED', '#9333EA',
    '#C026D3', '#DB2777', '#E11D48',
];

export const EmailBodyEditor = forwardRef<EmailBodyEditorRef, EmailBodyEditorProps>(({
    value,
    onChange,
    availableTables = [],
    availableCharts = [],
    availableVariables = [],
    availableAttachments = [],
    placeholder = 'Scrivi il corpo dell\'email...'
}, ref) => {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const editor = useEditor({
        extensions: [
            StarterKit,
            TextStyle,
            Color,
            Underline,
            Placeholder.configure({
                placeholder,
            }),
        ],
        content: value,
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
        editorProps: {
            attributes: {
                class: 'prose prose-sm max-w-none focus:outline-none min-h-[150px] p-3',
            },
        },
        immediatelyRender: false, // Fix for React 18 SSR
    });

    // Update editor content if value changes externally - optimized with debounce
    useEffect(() => {
        if (editor && value !== editor.getHTML()) {
            const timeoutId = setTimeout(() => {
                editor.commands.setContent(value);
            }, 100); // 100ms debounce to prevent rapid updates
            return () => clearTimeout(timeoutId);
        }
    }, [value, editor]);

    const insertPlaceholder = useCallback((type: 'TABELLA' | 'GRAFICO' | 'ALLEGATO' | 'LINK' | 'TRIGGER' | 'VARIABILE', name: string) => {
        if (editor) {
            editor.chain().focus().insertContent(`{{${type}:${name}}}`).run();
        }
    }, [editor]);

    useImperativeHandle(ref, () => ({
        insertPlaceholder
    }));

    if (!isMounted || !editor) {
        return <div className="h-[200px] bg-muted rounded-md animate-pulse" />;
    }

    return (
        <div className="border rounded-md overflow-hidden bg-background">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-1 p-2 border-b bg-muted/30">
                {/* Undo/Redo */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => editor.chain().focus().undo().run()}
                    disabled={!editor.can().undo()}
                >
                    <Undo className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => editor.chain().focus().redo().run()}
                    disabled={!editor.can().redo()}
                >
                    <Redo className="h-3.5 w-3.5" />
                </Button>

                <div className="w-px h-5 bg-border mx-1" />

                {/* Text formatting */}
                <Button
                    variant={editor.isActive('bold') ? 'secondary' : 'ghost'}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => editor.chain().focus().toggleBold().run()}
                >
                    <Bold className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant={editor.isActive('italic') ? 'secondary' : 'ghost'}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                >
                    <Italic className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant={editor.isActive('underline') ? 'secondary' : 'ghost'}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                >
                    <UnderlineIcon className="h-3.5 w-3.5" />
                </Button>

                {/* Color picker */}
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                            <Palette className="h-3.5 w-3.5" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-2">
                        <div className="grid grid-cols-6 gap-1">
                            {COLORS.map((color) => (
                                <button
                                    key={color}
                                    className="w-6 h-6 rounded border border-gray-200 hover:scale-110 transition-transform"
                                    style={{ backgroundColor: color }}
                                    onClick={() => editor.chain().focus().setColor(color).run()}
                                />
                            ))}
                        </div>
                    </PopoverContent>
                </Popover>

                <div className="w-px h-5 bg-border mx-1" />

                {/* Headings */}
                <Button
                    variant={editor.isActive('heading', { level: 1 }) ? 'secondary' : 'ghost'}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                >
                    <Heading1 className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant={editor.isActive('heading', { level: 2 }) ? 'secondary' : 'ghost'}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                >
                    <Heading2 className="h-3.5 w-3.5" />
                </Button>

                {/* Lists */}
                <Button
                    variant={editor.isActive('bulletList') ? 'secondary' : 'ghost'}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                >
                    <List className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant={editor.isActive('orderedList') ? 'secondary' : 'ghost'}
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                >
                    <ListOrdered className="h-3.5 w-3.5" />
                </Button>

                {/* NOTE: Insert buttons are now also available in the sidebar, but kept here for convenience if needed */}
                <div className="w-px h-5 bg-border mx-1" />

                {/* Insert Table */}
                {availableTables.length > 0 && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                                <TableIcon className="h-3.5 w-3.5" />
                                Tabella
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            {availableTables.map((table) => (
                                <DropdownMenuItem
                                    key={table.name}
                                    onClick={() => insertPlaceholder('TABELLA', table.name)}
                                >
                                    📊 {table.name}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}

                {/* Insert Chart */}
                {availableCharts.length > 0 && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                                <BarChart3 className="h-3.5 w-3.5" />
                                Grafico
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            {availableCharts.map((chart) => (
                                <DropdownMenuItem
                                    key={chart.name}
                                    onClick={() => insertPlaceholder('GRAFICO', chart.name)}
                                >
                                    📈 {chart.name}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}

                {/* Insert Variable */}
                {availableVariables.length > 0 && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                                <Code className="h-3.5 w-3.5" />
                                Variabile
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            {availableVariables.map((v) => (
                                <DropdownMenuItem
                                    key={v.name}
                                    onClick={() => insertPlaceholder('VARIABILE', v.name)}
                                >
                                    🔢 {v.name}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}

                {/* Insert Attachment */}
                {availableAttachments.length > 0 && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                                <Paperclip className="h-3.5 w-3.5" />
                                Allegati
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                            {availableAttachments.map((file) => (
                                <DropdownMenuItem
                                    key={file.filename}
                                    onClick={() => insertPlaceholder('ALLEGATO', file.filename)}
                                >
                                    📎 {file.filename} {file.size && `(${(file.size / 1024).toFixed(1)} KB)`}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
            </div>

            {/* Editor content */}
            <EditorContent editor={editor} className="min-h-[150px]" />

            {/* Placeholder legend */}
            <div className="px-3 py-1.5 border-t bg-muted/20 text-xs text-muted-foreground">
                <div className="flex justify-between items-center">
                    <span>💡 Usa la sidebar a destra per inserire contenuti e gestire gli allegati.</span>
                </div>
            </div>
        </div>
    );
});

EmailBodyEditor.displayName = 'EmailBodyEditor';
