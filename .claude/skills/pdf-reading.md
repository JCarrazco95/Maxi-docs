---
name: pdf-reading
description: Use this skill when you need to read, inspect, or extract content from PDF files.
---

# PDF Reading Guide

## Content Inventory (run first)

```bash
# Page count, metadata
pdfinfo document.pdf

# Quick text check — is this a text PDF or a scan?
pdftotext -f 1 -l 1 document.pdf - | head -20

# Check for embedded images
pdfimages -list document.pdf
```

## Text Extraction

```python
from pypdf import PdfReader

reader = PdfReader("document.pdf")
print(f"Pages: {len(reader.pages)}")

text = ""
for page in reader.pages:
    text += page.extract_text()
```

## Layout-aware extraction (better for multi-column)
```python
import pdfplumber

with pdfplumber.open("document.pdf") as pdf:
    for page in pdf.pages:
        text = page.extract_text()
        print(text)
```

## Extract Tables
```python
with pdfplumber.open("document.pdf") as pdf:
    for i, page in enumerate(pdf.pages):
        tables = page.extract_tables()
        for table in tables:
            print(table)
```

## Visual Inspection (for charts/diagrams)
```bash
# Rasterize page 3 at 150 DPI
pdftoppm -jpeg -r 150 -f 3 -l 3 document.pdf /tmp/page
ls /tmp/page-*.jpg
```

## Choosing Your Strategy

| Document Type | Strategy |
|--------------|----------|
| Text-heavy (reports, articles) | Text extraction |
| Scanned documents | Rasterize + OCR |
| Slide deck PDFs | Rasterize pages |
| Forms | `reader.get_fields()` |
| Data tables | pdfplumber |
| Charts/figures | Rasterize the page |

## Extract Form Fields
```python
from pypdf import PdfReader

reader = PdfReader("form.pdf")
all_fields = reader.get_fields() or {}
for name, field in all_fields.items():
    print(f"{name}: {field.get('/V', '')}")
```
