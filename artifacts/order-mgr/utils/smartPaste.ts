export interface ParsedOrder {
  customerName?: string;
  contactInfo?: string;  // Instagram handle (for backward compat)
  phone?: string;
  address?: string;
  pincode?: string;
  orderDate?: string;
  dueDate?: string;
  price?: number;
  notes?: string;
  customName?: string;
  orderRef?: string;
}

// ── Date Extraction ──────────────────────────────────────────────────────────

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

// ── Price Extraction ─────────────────────────────────────────────────────────

function extractPrice(text: string): number | undefined {
  const m =
    text.match(/(?:total|price|amount|cost|pay(?:ment)?|rs\.?|inr|₹)\s*[:=]?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i) ||
    text.match(/₹\s*([0-9,]+(?:\.[0-9]{1,2})?)/) ||
    text.match(/([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:rs\.?|inr|rupees?)/i) ||
    text.match(/(?:usd|\$|£|€)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i);
  if (m) {
    const val = parseFloat(m[1].replace(/,/g, ''));
    if (!isNaN(val) && val > 0) return val;
  }
  return undefined;
}

// ── Email Extraction ─────────────────────────────────────────────────────────
// Rule: email has text BEFORE @, then a domain with a TLD (e.g. user@gmail.com)
// Incomplete patterns like "mygmail@" (no domain/TLD) are NOT treated as email.

function extractEmail(text: string): string | undefined {
  // Must have: local-part @ domain . TLD (TLD required — rules out bare "user@")
  const m = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : undefined;
}

// ── Instagram Handle Extraction ───────────────────────────────────────────────
// Rule: Instagram handles start with @  (@ is the FIRST character of the token).
// e.g. @myshop, @my.shop_99  →  Instagram
// e.g. user@gmail.com        →  NOT Instagram (@ is in the middle, it's an email)

function extractInstagram(text: string): string | undefined {
  // Match @ only when it is at the start of the string, after whitespace, or after
  // a word boundary — ensuring @ is the leading character of the handle token.
  const m = text.match(/(?:^|(?<=[\s,;|]))((@[a-zA-Z0-9._]{1,30}))/);
  return m ? m[2] : undefined;
}

// ── Email vs Instagram Disambiguation ─────────────────────────────────────────
// Returns { email, instagram } by checking position of @ in each token.
//   - token STARTS with @  →  Instagram handle
//   - token has text BEFORE @ and a valid TLD AFTER →  Email
//   - "mygmail@" or "my.name@" (no domain/TLD) →  neither (ignored)

function disambiguateContactTokens(text: string): { email?: string; instagram?: string } {
  const result: { email?: string; instagram?: string } = {};

  // Split on whitespace/commas to get individual tokens
  const tokens = text.split(/[\s,;|]+/);
  for (const token of tokens) {
    if (!token.includes('@')) continue;

    const atIndex = token.indexOf('@');

    if (atIndex === 0) {
      // @ is the FIRST character → Instagram handle
      if (!result.instagram) {
        const m = token.match(/^@([a-zA-Z0-9._]{1,30})/);
        if (m) result.instagram = token;
      }
    } else {
      // @ is in the middle → potential email (must have valid domain + TLD)
      if (!result.email) {
        const m = token.match(/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/);
        if (m) result.email = token;
        // Note: "mygmail@" or "my.name@domain" (no TLD) won't match — correctly ignored
      }
    }
  }
  return result;
}

// ── Phone Extraction ─────────────────────────────────────────────────────────
// Phone number rules:
//   - Labeled:   any number tagged with phone/mobile/whatsapp/etc.
//   - Indian:    starts with 6-9, exactly 10 consecutive digits (e.g. 9876543210)
//   - +91:       country code prefix followed by 10-digit Indian number
//   - Spaced Indian: 5+5 format starting 6-9 (e.g. "98192 94752")
//   - International: explicit + country-code prefix (e.g. +1 415 555 0100)
// ⚠️  The old "generic" fallback that matched any 7-15 digit group is REMOVED
//     because it greedily swallowed adjacent numbers (like a pincode + phone on
//     the same line).  Only start with 6-9 OR have an explicit + prefix.

function extractPhone(text: string): string | undefined {
  // Priority 1: explicitly labeled phone lines (trust the label fully)
  const labeled = text.match(
    /(?:phone|mobile|mob|whatsapp|contact|call|ph)[.\s:]*([+\d][\d\s\-().]{7,18}\d)/i
  );
  if (labeled) {
    const cleaned = labeled[1].replace(/[\s\-().]/g, '');
    // Must be ≥7 digits (rules out 6-digit pincodes even if someone labels wrong)
    if (cleaned.length >= 7) return labeled[1].trim();
  }

  // Priority 2: +91 country code (consecutive or lightly spaced)
  const withCode = text.match(/(?<![0-9])(\+91[\s\-]?)([6-9]\d{9})(?![0-9])/);
  if (withCode) return (withCode[1].trim() + ' ' + withCode[2]).trim();

  // Priority 3: plain Indian 10-digit — MUST start with 6-9, exactly 10 consecutive digits
  //   e.g. 9876543210  — NOT 401203 (starts with 4), NOT 98192 94752 (has space → handled below)
  const indian = text.match(/(?<![0-9])([6-9]\d{9})(?![0-9])/);
  if (indian) return indian[1];

  // Priority 4: space/dash-formatted Indian — "98192 94752" (5+5), "94752-98192" etc.
  //   First half must start with 6-9 to stay in Indian number territory.
  const spacedIndian = text.match(/(?<![0-9])([6-9]\d{4})[\s\-](\d{5})(?![0-9])/);
  if (spacedIndian) return (spacedIndian[1] + ' ' + spacedIndian[2]);

  // Priority 5: international with explicit + prefix (e.g. +1 415 555 0100)
  //   Require the leading + so we don't confuse random digit runs with phone numbers.
  const international = text.match(/(?<![0-9])(\+[1-9]\d{0,3}[\s\-]?\d{4,14})(?![0-9])/);
  if (international) {
    const cleaned = international[1].replace(/[\s\-]/g, '');
    if (cleaned.length >= 8 && cleaned.length <= 16) return international[1].trim();
  }

  return undefined;
}

// ── Pincode Extraction ───────────────────────────────────────────────────────
// Pincode rules:
//   - Indian PIN code: EXACTLY 6 digits, first digit 1-9 (no leading zero)
//   - Labeled: highest priority; also handles space/dash-separated "401 203" or "401-203"
//   - Standalone: exactly 6 consecutive digits, not embedded in a longer number
// ⚠️  "98192 94752" is NOT a pincode — the first group (98192) is 5 digits so
//     it never matches the 6-digit pattern. The phone extractor handles it.

function extractPincode(text: string): string | undefined {
  // Priority 1: explicitly labeled — supports "pin: 401203", "pin: 401 203", "pin: 401-203"
  const labeled = text.match(
    /(?:pin(?:code)?|zip|postal)[.\s:]*(\d{3}[\s\-]?\d{3})(?!\d)/i
  );
  if (labeled) {
    // Normalize: strip the optional space/dash between the two 3-digit groups
    return labeled[1].replace(/[\s\-]/, '');
  }

  // Priority 2: Standalone 6 consecutive digits (first digit 1-9, not in a longer run)
  //   e.g. 401203 ✓  |  9819294752 ✗ (10 digits, caught by phone)  |  401 203 ✗ (has space, use label)
  const standalone = text.match(/(?<!\d)([1-9]\d{5})(?!\d)/);
  if (standalone) return standalone[1];

  return undefined;
}

// ── Address Extraction ───────────────────────────────────────────────────────
// Looks for labeled blocks or lines containing address keywords

function extractAddress(lines: string[]): string | undefined {
  // 1. Labeled single-line
  for (const line of lines) {
    const labeled = line.match(
      /(?:address|addr|delivery\s+address|ship(?:ping)?\s+(?:to|address)|deliver\s+to)[.\s:]+(.+)/i
    );
    if (labeled && labeled[1].trim().length > 4) return labeled[1].trim();
  }

  // 2. Multi-line address block: collect lines that look address-like
  const addressKeywords = /\b(flat|house|floor|plot|no\.|road|street|lane|nagar|colony|sector|phase|block|area|town|city|district|state|near|opp|behind|above|below|landmark)\b/i;
  const addressLines: string[] = [];
  let capturing = false;
  for (const line of lines) {
    if (addressKeywords.test(line)) {
      capturing = true;
    }
    if (capturing) {
      addressLines.push(line);
      // Stop after 4 lines or on an empty pattern
      if (addressLines.length >= 4) break;
    }
  }
  if (addressLines.length > 0) return addressLines.join(', ');

  return undefined;
}

// ── Name Extraction ──────────────────────────────────────────────────────────

function looksLikeName(s: string): boolean {
  // Proper name: 1-4 words, each starting with uppercase, no digits/symbols
  return /^[A-Z][a-zA-Z]+(?: [A-Z][a-zA-Z]+){0,3}$/.test(s.trim()) && s.trim().length >= 3;
}

// ── Main Parser ──────────────────────────────────────────────────────────────

export function parseOrderText(text: string): ParsedOrder {
  const result: ParsedOrder = {};
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // ── Pass 1: Labeled fields ────────────────────────────────────────────────
  for (const line of lines) {
    const lower = line.toLowerCase();

    // Customer name — labeled
    if (!result.customerName) {
      const nm = line.match(
        /^(?:name|customer(?:\s+name)?|from|buyer|client|ship\s+to|deliver(?:y)?\s+to)[.\s:]+([A-Za-z][A-Za-z\s]{1,40})/i
      );
      if (nm) result.customerName = nm[1].trim();
    }

    // Phone — labeled or Indian format
    if (!result.phone) {
      result.phone = extractPhone(line);
    }

    // Instagram — detected when line is explicitly labelled OR starts with @
    // (@ at start of token = Instagram, @ in middle = email — see disambiguateContactTokens)
    if (!result.contactInfo) {
      if (lower.includes('ig') || lower.includes('instagram') || line.trimStart().startsWith('@')) {
        const ig = extractInstagram(line);
        if (ig) result.contactInfo = ig;
      }
    }

    // Order date
    if (!result.orderDate) {
      if (/order\s*date|date:|ordered|placed\s+on/i.test(lower)) {
        result.orderDate = extractDate(line);
      }
    }

    // Due date
    if (!result.dueDate) {
      if (/due|deliver|ship\s*date|deadline|needed\s+by|expected/i.test(lower)) {
        result.dueDate = extractDate(line);
      }
    }

    // Price
    if (!result.price) {
      result.price = extractPrice(line);
    }

    // Product / item
    if (!result.customName) {
      const itemM = line.match(/(?:item|product|order|qty|quantity|x\d)[.\s:]+([^,\n]+)/i);
      if (itemM) result.customName = itemM[1].trim();
    }

    // Order reference
    if (!result.orderRef) {
      const refM = line.match(/(?:order\s*(?:#|no|ref|id|number))[.\s:]*([A-Z0-9\-]+)/i);
      if (refM) result.orderRef = refM[1].trim();
    }
  }

  // ── Pass 2: Address ───────────────────────────────────────────────────────
  if (!result.address) {
    result.address = extractAddress(lines);
  }

  // ── Pass 3: Pincode ───────────────────────────────────────────────────────
  if (!result.pincode) {
    result.pincode = extractPincode(text);
    // Append pincode to address if found but not already in there
    if (result.pincode && result.address && !result.address.includes(result.pincode)) {
      result.address = result.address + ' - ' + result.pincode;
    }
  }

  // ── Fallbacks ─────────────────────────────────────────────────────────────

  // Contact: use token-level disambiguation to correctly separate email from Instagram.
  // Rule: @ at START of token = Instagram handle; @ in MIDDLE with TLD = email.
  // This prevents "mygmail@" being treated as Instagram and "@shop.fashion" as email.
  if (!result.contactInfo) {
    const { email, instagram } = disambiguateContactTokens(text);
    result.contactInfo = email || instagram;
  }
  // Phone fallback over full text
  if (!result.phone) {
    result.phone = extractPhone(text);
  }

  // Name fallback: greeting
  if (!result.customerName) {
    const greet = text.match(/(?:hi|hello|dear|hey)[,\s]+([A-Z][a-zA-Z\s]{1,25})/i);
    if (greet) result.customerName = greet[1].trim();
  }
  // Name fallback: first line if it looks like a name
  if (!result.customerName && lines.length > 0) {
    const firstLineClean = lines[0].replace(/^(name|customer)[:\s]+/i, '').trim();
    if (looksLikeName(firstLineClean)) {
      result.customerName = firstLineClean;
    }
  }

  // Date fallbacks
  if (!result.orderDate) result.orderDate = extractDate(text);
  if (!result.price) result.price = extractPrice(text);

  // Notes: append order ref
  const noteLines: string[] = [];
  if (result.orderRef) noteLines.push(`Ref: ${result.orderRef}`);
  result.notes = noteLines.join('\n');

  return result;
}
