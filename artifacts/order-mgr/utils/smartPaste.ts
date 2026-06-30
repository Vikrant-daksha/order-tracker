export interface ParsedOrder {
  customerName?: string;
  contactInfo?: string;
  orderDate?: string;
  dueDate?: string;
  price?: number;
  notes?: string;
  customName?: string;
  orderRef?: string;
}

function extractDate(text: string): string | undefined {
  const patterns = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i,
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      try {
        const d = new Date(m[0]);
        if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
      } catch {}
    }
  }
  return undefined;
}

function extractPrice(text: string): number | undefined {
  const m = text.match(/(?:total|price|amount|cost|pay|payment|usd|\$|£|€|rm|php|idr)[\s:]*([0-9,]+(?:\.[0-9]{1,2})?)/i)
    || text.match(/([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:usd|php|idr|rm|dollars?|total)/i)
    || text.match(/\$([0-9,]+(?:\.[0-9]{1,2})?)/);
  if (m) {
    const val = parseFloat(m[1].replace(',', ''));
    if (!isNaN(val) && val > 0) return val;
  }
  return undefined;
}

function extractEmail(text: string): string | undefined {
  const m = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : undefined;
}

function extractPhone(text: string): string | undefined {
  const m = text.match(/(?:\+?[\d\s\-().]{9,15})/);
  if (m) {
    const cleaned = m[0].replace(/[\s\-().]/g, '');
    if (cleaned.length >= 7) return m[0].trim();
  }
  return undefined;
}

function extractInstagram(text: string): string | undefined {
  const m = text.match(/@([a-zA-Z0-9._]+)/);
  return m ? m[0] : undefined;
}

export function parseOrderText(text: string): ParsedOrder {
  const result: ParsedOrder = {};
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (!result.customerName) {
      const nameMatch = line.match(/(?:name|customer|from|buyer|client|ship to|deliver to)[\s:]+([A-Z][a-zA-Z\s]{1,40})/i);
      if (nameMatch) result.customerName = nameMatch[1].trim();
    }

    if (!result.contactInfo) {
      const email = extractEmail(line);
      if (email) { result.contactInfo = email; continue; }
      const ig = extractInstagram(line);
      if (ig && lower.includes('ig') || lower.includes('instagram') || line.startsWith('@')) {
        result.contactInfo = ig || line; continue;
      }
      const phone = extractPhone(line);
      if (phone && (lower.includes('phone') || lower.includes('contact') || lower.includes('mobile') || lower.includes('whatsapp'))) {
        result.contactInfo = phone; continue;
      }
    }

    if (!result.orderDate) {
      if (lower.includes('order date') || lower.includes('date:') || lower.includes('ordered')) {
        result.orderDate = extractDate(line);
      }
    }

    if (!result.dueDate) {
      if (lower.includes('due') || lower.includes('deliver') || lower.includes('ship date') || lower.includes('deadline') || lower.includes('needed by')) {
        result.dueDate = extractDate(line);
      }
    }

    if (!result.price) {
      result.price = extractPrice(line);
    }

    if (!result.customName) {
      const itemMatch = line.match(/(?:item|product|order|qty|quantity|x\d)[\s:]+([^,\n]+)/i);
      if (itemMatch) result.customName = itemMatch[1].trim();
    }

    if (!result.orderRef) {
      const refMatch = line.match(/(?:order\s*(?:#|no|ref|id|number))[\s:]*([A-Z0-9\-]+)/i);
      if (refMatch) result.orderRef = refMatch[1].trim();
    }
  }

  if (!result.contactInfo) {
    result.contactInfo = extractEmail(text) || extractInstagram(text) || extractPhone(text);
  }

  if (!result.customerName) {
    const match = text.match(/(?:hi|hello|dear)\s+([A-Z][a-zA-Z\s]{1,25})/i);
    if (match) result.customerName = match[1].trim();
  }

  if (!result.orderDate) result.orderDate = extractDate(text);
  if (!result.price) result.price = extractPrice(text);

  const noteLines: string[] = [];
  if (result.orderRef) noteLines.push(`Ref: ${result.orderRef}`);
  result.notes = noteLines.join('\n');

  return result;
}
