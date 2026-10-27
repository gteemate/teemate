// node scripts/print-pdf.mjs <page.html> <out.pdf> — prints one of the docs/*.html pages to an A4 PDF (page numbers in the footer).
import { chromium } from '@playwright/test'
import { resolve } from 'node:path'
const [src, out] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(`file://${resolve(src)}`, { waitUntil: 'load' })
await page.pdf({ path: out, format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>',
  footerTemplate: '<div style="font:8px Arial;color:#5b6475;width:100%;text-align:center">page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
  margin: { top: '14mm', bottom: '16mm', left: '15mm', right: '15mm' } })
await browser.close()
console.log(`Wrote ${out}`)
