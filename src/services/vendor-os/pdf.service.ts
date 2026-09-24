import PDFDocument from 'pdfkit';
import { IVendorQuote } from '../../models/vendor-os/vendor-quote.model';
import { IVendorPayment } from '../../models/vendor-os/vendor-payment.model';
import { IVendorBooking } from '../../models/vendor-os/vendor-booking.model';
import { formatDisplayDate, formatINR } from '../../utils/vendorOs';

// Branded quote and receipt PDFs. pdfkit's built-in Helvetica has no ₹
// glyph, so amounts render as "Rs. 1,20,000" (formatINR).

interface VendorHeader {
  businessName: string;
  phone?: string;
  whatsappNumber?: string;
  email?: string;
  gstNumber?: string;
  location?: { address?: string; city?: string; state?: string };
}

interface ClientInfo {
  name: string;
  phone?: string;
  email?: string;
}

const BRAND = '#8B1E3F';
const MUTED = '#666666';

const render = (build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 48, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      build(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });

const header = (doc: PDFKit.PDFDocument, vendor: VendorHeader, title: string, meta: [string, string][]) => {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(20).text(vendor.businessName, left, 48, { width: 320 });
  doc.fillColor(MUTED).font('Helvetica').fontSize(9);
  const address = [vendor.location?.address, vendor.location?.city, vendor.location?.state].filter(Boolean).join(', ');
  if (address) doc.text(address, { width: 320 });
  const contact = [vendor.whatsappNumber || vendor.phone, vendor.email].filter(Boolean).join('  ·  ');
  if (contact) doc.text(contact, { width: 320 });
  if (vendor.gstNumber) doc.text(`GSTIN: ${vendor.gstNumber}`, { width: 320 });

  doc.fillColor('#000').font('Helvetica-Bold').fontSize(16).text(title, right - 200, 48, { width: 200, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(MUTED);
  for (const [k, v] of meta) doc.text(`${k}: ${v}`, right - 200, doc.y, { width: 200, align: 'right' });

  doc.y = Math.max(doc.y, 130);
  doc.moveTo(left, doc.y + 6).lineTo(right, doc.y + 6).strokeColor(BRAND).lineWidth(1.5).stroke();
  doc.y += 16;
};

const sectionTitle = (doc: PDFKit.PDFDocument, text: string) => {
  doc.moveDown(0.8);
  doc.x = doc.page.margins.left;
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(11).text(text.toUpperCase());
  doc.moveDown(0.3);
  doc.fillColor('#000').font('Helvetica').fontSize(10);
};

const ensureSpace = (doc: PDFKit.PDFDocument, needed: number) => {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) doc.addPage();
};

export class VendorPdfService {
  static quote(quote: IVendorQuote, vendor: VendorHeader, client: ClientInfo): Promise<Buffer> {
    return render((doc) => {
      const left = doc.page.margins.left;
      const right = doc.page.width - doc.page.margins.right;
      header(doc, vendor, 'QUOTATION', [
        ['Quote no', `${quote.quoteNumber}${quote.version > 1 ? ` (v${quote.version})` : ''}`],
        ['Date', formatDisplayDate(quote.sentAt || quote.createdAt)],
        ['Valid till', formatDisplayDate(quote.validTill) || '—'],
      ]);

      doc.fillColor(MUTED).fontSize(9).text('PREPARED FOR', left);
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(11).text(client.name);
      doc.font('Helvetica').fontSize(9).text([client.phone, client.email].filter(Boolean).join('  ·  '));
      if (quote.title) doc.moveDown(0.5).font('Helvetica-Bold').fontSize(12).text(quote.title);

      if (quote.events.length) {
        sectionTitle(doc, 'Events');
        for (const e of quote.events) {
          doc.text(`• ${e.functionType} — ${formatDisplayDate(e.date)} (${e.slot.replace('_', ' ')})${e.venue ? `, ${e.venue}` : ''}${e.guestCount ? `, ${e.guestCount} guests` : ''}`);
        }
      }

      sectionTitle(doc, 'Line items');
      const cols = { item: left, qty: left + 270, rate: left + 330, tax: left + 400, amount: right - 90 };
      const row = (vals: [string, string, string, string, string], bold = false) => {
        ensureSpace(doc, 30);
        const y = doc.y;
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
        doc.text(vals[0], cols.item, y, { width: 260 });
        const itemBottom = doc.y;
        doc.text(vals[1], cols.qty, y, { width: 55, align: 'right' });
        doc.text(vals[2], cols.rate, y, { width: 65, align: 'right' });
        doc.text(vals[3], cols.tax, y, { width: 40, align: 'right' });
        doc.text(vals[4], cols.amount, y, { width: 90, align: 'right' });
        doc.y = Math.max(itemBottom, doc.y) + 4;
      };
      row(['Item', 'Qty', 'Rate', quote.gstEnabled ? 'GST' : '', 'Amount'], true);
      doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#cccccc').lineWidth(0.5).stroke();
      doc.y += 4;
      for (const item of quote.items) {
        row([
          item.description ? `${item.name}\n${item.description}` : item.name,
          `${item.qty}${item.unit ? ` ${item.unit}` : ''}`,
          formatINR(item.rate),
          quote.gstEnabled ? `${item.taxPercent}%` : '',
          formatINR(item.amount),
        ]);
      }
      doc.moveTo(left, doc.y).lineTo(right, doc.y).strokeColor('#cccccc').stroke();
      doc.y += 6;

      const totalLine = (label: string, value: string, bold = false) => {
        ensureSpace(doc, 18);
        const y = doc.y;
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10);
        doc.text(label, right - 260, y, { width: 160, align: 'right' });
        doc.text(value, right - 100, y, { width: 100, align: 'right' });
        doc.y = y + (bold ? 18 : 14);
      };
      totalLine('Subtotal', formatINR(quote.subtotal));
      if (quote.discountAmount) totalLine('Discount', `- ${formatINR(quote.discountAmount)}`);
      if (quote.gstEnabled) totalLine('GST', formatINR(quote.taxTotal));
      doc.fillColor(BRAND);
      totalLine('Total', formatINR(quote.total), true);
      doc.fillColor('#000');

      if (quote.paymentSchedule.length) {
        sectionTitle(doc, 'Payment schedule');
        for (const p of quote.paymentSchedule) {
          doc.text(`• ${p.label}: ${formatINR(p.amount)}${p.percent ? ` (${p.percent}%)` : ''}${p.dueDate ? ` — by ${formatDisplayDate(p.dueDate)}` : ''}`);
        }
      }
      if (quote.deliverables.length) {
        sectionTitle(doc, 'Deliverables');
        for (const d of quote.deliverables) doc.text(`• ${d}`);
      }
      if (quote.terms) {
        sectionTitle(doc, 'Terms & conditions');
        doc.fontSize(9).text(quote.terms);
      }
      doc.moveDown(2).fillColor(MUTED).fontSize(8).text('Generated with ApnaUtsav Vendor OS', { align: 'center' });
    });
  }

  static receipt(payment: IVendorPayment, booking: IVendorBooking, vendor: VendorHeader): Promise<Buffer> {
    return render((doc) => {
      const left = doc.page.margins.left;
      header(doc, vendor, 'PAYMENT RECEIPT', [
        ['Receipt no', payment.receiptNo],
        ['Date', formatDisplayDate(payment.receivedAt)],
        ['Booking', booking.bookingNumber],
      ]);

      if (payment.isVoided) {
        doc.fillColor('#C00000').font('Helvetica-Bold').fontSize(14).text('VOID', left);
        doc.fillColor('#000').moveDown(0.5);
      }

      doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('RECEIVED FROM', left);
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(12).text(booking.client.name);
      doc.font('Helvetica').fontSize(9).text(booking.client.phone || '');

      doc.moveDown(1.2);
      doc.font('Helvetica-Bold').fontSize(22).fillColor(BRAND).text(formatINR(payment.amount), left);
      doc.fillColor('#000').font('Helvetica').fontSize(10);
      doc.text(`Mode: ${payment.mode.toUpperCase()}${payment.reference ? `  ·  Ref: ${payment.reference}` : ''}`);
      if (payment.notes) doc.text(`Note: ${payment.notes}`);

      sectionTitle(doc, 'Booking summary');
      if (booking.title) doc.text(booking.title);
      for (const e of booking.events) doc.text(`• ${e.functionType} — ${formatDisplayDate(e.date)}${e.venue ? `, ${e.venue}` : ''}`);
      doc.moveDown(0.5);
      doc.text(`Booking total: ${formatINR(booking.totalAmount)}`);
      doc.text(`Total received: ${formatINR(booking.amountPaid)}`);
      doc.font('Helvetica-Bold').text(`Balance due: ${formatINR(booking.balanceDue)}`);

      doc.moveDown(3).font('Helvetica').fillColor(MUTED).fontSize(8).text('This is a computer-generated receipt from ApnaUtsav Vendor OS.', { align: 'center' });
    });
  }

  /** Printable crew call sheet for one booking event. */
  static callSheet(sheet: {
    vendor: { businessName: string; phone?: string };
    managers: { name?: string; phone: string; role: string }[];
    booking: { bookingNumber: string; title?: string };
    client: { name: string; phone?: string };
    event: { functionType: string; date: string; slot: string; startTime?: string; endTime?: string; venue?: string; city?: string; guestCount?: number; notes?: string };
    crew: { name?: string; phone?: string; role?: string; callTime?: string; reportingLocation?: string; status: string }[];
    runSheet: { items: { time: string; endTime?: string; title: string; location?: string; crewMemberIds?: any[] }[]; notes?: string } | null;
  }): Promise<Buffer> {
    return render((doc) => {
      const left = doc.page.margins.left;
      const right = doc.page.width - doc.page.margins.right;
      header(doc, { businessName: sheet.vendor.businessName, phone: sheet.vendor.phone }, 'CALL SHEET', [
        ['Booking', sheet.booking.bookingNumber],
        ['Date', formatDisplayDate(new Date(sheet.event.date))],
        ['Function', sheet.event.functionType],
      ]);

      doc.font('Helvetica-Bold').fontSize(12).text(`${sheet.event.functionType} — ${sheet.client.name}`, left);
      doc.font('Helvetica').fontSize(10);
      const timing = [sheet.event.startTime, sheet.event.endTime].filter(Boolean).join(' – ') || sheet.event.slot.replace('_', ' ');
      doc.text(`Time: ${timing}`);
      doc.text(`Venue: ${[sheet.event.venue, sheet.event.city].filter(Boolean).join(', ') || 'TBC'}`);
      if (sheet.event.guestCount) doc.text(`Guests: ${sheet.event.guestCount}`);
      if (sheet.event.notes) doc.text(`Notes: ${sheet.event.notes}`);

      sectionTitle(doc, 'Crew');
      const cols = [left, left + 150, left + 280, left + 350, left + 420];
      const row = (vals: string[], bold = false) => {
        ensureSpace(doc, 20);
        const y = doc.y;
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
        vals.forEach((v, i) => doc.text(v, cols[i], y, { width: (cols[i + 1] || right) - cols[i] - 6, ellipsis: true, lineBreak: false }));
        doc.y = y + 16;
      };
      row(['Name', 'Role', 'Call time', 'Status', 'Phone'], true);
      for (const c of sheet.crew) row([c.name || '', c.role || '', c.callTime || '—', c.status, c.phone || '']);
      if (!sheet.crew.length) doc.font('Helvetica').fontSize(9).text('No crew assigned yet.', left);

      if (sheet.runSheet?.items.length) {
        sectionTitle(doc, 'Run sheet');
        for (const item of sheet.runSheet.items) {
          ensureSpace(doc, 18);
          const who = (item.crewMemberIds || []).map((c: any) => c?.name).filter(Boolean).join(', ');
          doc.font('Helvetica-Bold').fontSize(10).text(`${item.time}${item.endTime ? `–${item.endTime}` : ''}`, left, doc.y, { continued: true });
          doc.font('Helvetica').text(`   ${item.title}${item.location ? ` @ ${item.location}` : ''}${who ? `  (${who})` : ''}`);
        }
        if (sheet.runSheet.notes) doc.moveDown(0.5).fontSize(9).text(sheet.runSheet.notes);
      }

      sectionTitle(doc, 'Contacts');
      doc.text(`Client: ${sheet.client.name}${sheet.client.phone ? ` — ${sheet.client.phone}` : ''}`);
      for (const m of sheet.managers) doc.text(`${m.role === 'owner' ? 'Owner' : 'Manager'}: ${m.name || ''} — ${m.phone}`);

      doc.moveDown(2).fillColor(MUTED).fontSize(8).text('Generated with ApnaUtsav Vendor OS', { align: 'center' });
    });
  }
}
