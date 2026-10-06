import { Response } from 'express';
import PDFDocument from 'pdfkit';

export interface ExportColumn {
  key: string;
  label: string;
}

/**
 * Track C: an agency on a plan with branded exports gets its own name, logo
 * and colour on PDFs from its client weddings (services/org/org-branding.ts
 * builds this). Absent = the plain ApnaUtsav PDF, exactly as before.
 */
export interface ExportBranding {
  name: string;
  color?: string;
  /** PNG/JPEG bytes (the only formats pdfkit embeds). */
  logo?: Buffer;
  showPoweredBy: boolean;
}

// Wraps a value in quotes and escapes internal quotes whenever it contains
// a comma, quote, or newline — the standard CSV escaping rule (RFC 4180).
const escapeCsvValue = (value: any): string => {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export const toCSV = (rows: Record<string, any>[], columns: ExportColumn[]): string => {
  const header = columns.map((c) => escapeCsvValue(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => escapeCsvValue(row[c.key])).join(','));
  return [header, ...lines].join('\r\n');
};

// pdfkit has no built-in table helper, so this lays out a simple fixed-width
// column grid by hand: header row, a rule, then each data row, wrapping to
// a new page (re-printing the header) whenever it runs out of vertical
// room. Good enough for the export lists this backs — tens to low
// hundreds of rows, not a print-grade report.
export const toPDF = (title: string, rows: Record<string, any>[], columns: ExportColumn[], branding?: ExportBranding): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape', bufferPages: !!branding });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      const left = doc.page.margins.left;
      const right = doc.page.width - doc.page.margins.right;
      const bottom = doc.page.height - doc.page.margins.bottom;
      const pageWidth = right - left;
      const colWidth = pageWidth / columns.length;
      const rowHeight = 20;

      let y = doc.page.margins.top;

      const drawHeaderRule = () => {
        doc.moveTo(left, y).lineTo(right, y).strokeColor('#999999').stroke();
        y += 4;
      };

      const drawRow = (values: string[], isHeader: boolean) => {
        doc.fontSize(9).font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fillColor('#000000');
        values.forEach((val, i) => {
          doc.text(val, left + i * colWidth, y, {
            width: colWidth - 6,
            ellipsis: true,
            lineBreak: false
          });
        });
        y += rowHeight;
      };

      const drawHeader = () => {
        drawRow(columns.map((c) => c.label), true);
        drawHeaderRule();
      };

      if (branding) {
        const accent = branding.color || '#9e2b46';
        let textLeft = left;
        if (branding.logo) {
          try {
            doc.image(branding.logo, left, y, { fit: [44, 44] });
            textLeft = left + 56;
          } catch {
            // Unreadable logo — fall back to the name only.
          }
        }
        doc.fontSize(14).font('Helvetica-Bold').fillColor(accent).text(branding.name, textLeft, y + 4, { lineBreak: false });
        doc.fontSize(9).font('Helvetica').fillColor('#6b5a5f').text(
          `Prepared ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`,
          textLeft,
          y + 24,
          { lineBreak: false }
        );
        y += 56;
        doc.moveTo(left, y).lineTo(right, y).lineWidth(2).strokeColor(accent).stroke().lineWidth(1);
        y += 12;
        doc.fillColor('#000000');
      }

      doc.fontSize(18).font('Helvetica-Bold').text(title, left, y);
      y = doc.y + 16;

      drawHeader();

      for (const row of rows) {
        if (y + rowHeight > bottom) {
          doc.addPage();
          y = doc.page.margins.top;
          drawHeader();
        }
        drawRow(columns.map((c) => (row[c.key] === null || row[c.key] === undefined ? '' : String(row[c.key]))), false);
      }

      if (branding) {
        // Footer on every page, drawn last (bufferPages) so page counts are known.
        const range = doc.bufferedPageRange();
        const footer = branding.showPoweredBy ? `Prepared by ${branding.name} · Powered by ApnaUtsav` : `Prepared by ${branding.name}`;
        for (let i = range.start; i < range.start + range.count; i++) {
          doc.switchToPage(i);
          const bottomMargin = doc.page.margins.bottom;
          doc.page.margins.bottom = 0; // let us write inside the margin without pdfkit adding a page
          doc
            .fontSize(8)
            .font('Helvetica')
            .fillColor('#8a7a75')
            .text(`${footer}   ·   Page ${i - range.start + 1} of ${range.count}`, left, doc.page.height - 26, { width: pageWidth, align: 'center', lineBreak: false });
          doc.page.margins.bottom = bottomMargin;
        }
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

// Shared by every resource's GET .../export?format=csv|pdf route — builds
// the requested format and streams it back with the right headers, so
// each controller only has to supply rows/columns/a title.
export const sendExport = async (
  res: Response,
  format: string | undefined,
  title: string,
  filenameBase: string,
  rows: Record<string, any>[],
  columns: ExportColumn[],
  branding?: ExportBranding | null
): Promise<void> => {
  if (format === 'pdf') {
    const buffer = await toPDF(title, rows, columns, branding ?? undefined);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.pdf"`);
    res.send(buffer);
  } else {
    const csv = toCSV(rows, columns);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`);
    res.send(csv);
  }
};
