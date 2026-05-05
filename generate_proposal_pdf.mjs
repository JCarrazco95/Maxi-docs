import puppeteer from 'puppeteer'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const htmlPath = join(__dirname, 'propuesta_servicios_maxidocs.html')
const pdfPath  = join(__dirname, 'propuesta_servicios_maxidocs.pdf')

const html = readFileSync(htmlPath, 'utf8')

console.log('Iniciando Puppeteer...')

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
})

const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle0' })

const pdf = await page.pdf({
  format:          'A4',
  printBackground: true,
  margin:          { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
  displayHeaderFooter: false,
})

await browser.close()

writeFileSync(pdfPath, pdf)
console.log('✓ PDF generado:', pdfPath)
console.log('  Tamaño:', Math.round(pdf.length / 1024), 'KB')
