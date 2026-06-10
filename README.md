# UReader

A lightweight, feature-rich AI-powered PDF reader for Windows.

UReader is a desktop application built with Electron + React that combines traditional PDF reading with modern AI capabilities. Designed to be fast, clean, and genuinely useful for anyone who reads, annotates, and takes notes on PDF documents.

## Features

### PDF Reading
- **Continuous scroll** — smooth, native-feeling scrolling through all pages
- **Multi-tab support** — open and switch between multiple PDFs simultaneously
- **Zoom & navigation** — keyboard shortcuts, fit-to-width, fit-to-page, go-to-page
- **Full-text search** — search across the entire document with result highlighting
- **Outline / bookmarks panel** — navigate PDF outlines and custom bookmarks

### Annotations
- **Highlight** — select text and highlight with multiple color options (Okular-style)
- **Underline** — underline selected text with color choices
- **Text boxes** — draw text boxes directly on the PDF pages
  - Drag to create with custom size
  - Move and resize with 8-directional handles
  - Adjustable font size (Ctrl+scroll or +/− controls)
  - Transparent background — text floats cleanly on the PDF
- **Bookmarks** — mark any page with a custom name, rename inline, navigate from sidebar

### Notes
- **Markdown notes panel** — write notes in Markdown alongside your PDF
- **Auto-save** — notes are saved per-document automatically

### AI Integration
- **AI document reading** — let AI analyze and summarize the full PDF content
- **AI Q&A chat** — ask questions about the document and get contextual answers
- **Multiple AI providers** — supports OpenAI, Ollama, and custom OpenAI-compatible APIs
- **Configurable models** — set API key, model name, and base URL per provider

### Keyboard Shortcuts
| Shortcut | Action |
|---|---|
| `Ctrl+O` | Open PDF file |
| `Ctrl+F` | Toggle search |
| `Ctrl+B` | Toggle bookmark on current page |
| `Ctrl+W` | Close current tab |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Switch tabs |
| `Ctrl++` / `Ctrl+-` | Zoom in / out |
| `Ctrl+0` | Reset zoom |
| `T` | Toggle text tool |
| `Escape` | Deactivate text tool |
| `←` / `→` | Previous / next page |

## Tech Stack

- **Electron** — cross-platform desktop shell
- **React 19** + **TypeScript** — UI layer
- **Vite** — build tooling
- **pdfjs-dist** — PDF rendering and text extraction
- **electron-builder** — Windows installer (NSIS)

## Getting Started

### Prerequisites
- Node.js >= 18
- Windows 10/11

### Install & Run (Development)
```bash
git clone https://github.com/YOUR_USERNAME/UReader.git
cd UReader
npm install
npm run electron:dev
```

### Build Installer
```bash
npm run electron:build
```
The installer (`UReader Setup 1.0.0.exe`) will be generated in the project root, ready to distribute.

## Installation

Download `UReader Setup 1.0.0.exe` and run it. The installer will guide you through choosing an installation directory and creating shortcuts.

## Sponsor

If you find UReader useful, consider buying me a coffee :coffee:

<img src="img/qrcode.png" alt="Sponsor" width="200" />

## License

MIT
