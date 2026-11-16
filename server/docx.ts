import zlib from 'zlib';

// Мінімальний читач .docx без зовнішніх бібліотек: .docx це zip, а текст лежить у word/document.xml.
// Розпізнає питання «1. Текст» і варіанти «1.1. Текст» (набрані вручну або автонумерованим списком).

export interface ParsedQuestion {
  title: string;
  options: string[];
  detectedCorrect: number[]; // індекси варіантів, виділених жирним (або позначених * / +)
}

export interface ParseResult {
  questions: ParsedQuestion[];
  warnings: string[];
}

function readZipEntry(buf: Buffer, name: string): Buffer | null {
  // Кінець центрального каталогу
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Це не схоже на файл .docx.');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const entryName = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (entryName === name) {
      const lNameLen = buf.readUInt16LE(localOffset + 26);
      const lExtraLen = buf.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(start, start + compSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return zlib.inflateRawSync(data, { maxOutputLength: 30 * 1024 * 1024 });
      throw new Error('Непідтримуваний спосіб стиснення у файлі.');
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');

interface Para { text: string; bold: boolean; level: number | null }

function extractParagraphs(xml: string): Para[] {
  const out: Para[] = [];
  for (const pm of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const pxml = pm[0];
    const lvl = /<w:numPr>[\s\S]*?<w:ilvl w:val="(\d+)"/.exec(pxml);
    const hasNum = /<w:numPr>/.test(pxml);
    let text = '';
    let anyText = false;
    let allBold = true;
    for (const rm of pxml.matchAll(/<w:r[ >][\s\S]*?<\/w:r>/g)) {
      const rxml = rm[0];
      let t = '';
      for (const m of rxml.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)) {
        t += m[1] !== undefined ? unescapeXml(m[1]) : ' ';
      }
      if (!t.trim()) { text += t; continue; }
      const rpr = /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(rxml)?.[0] || '';
      const b = /<w:b(?: [^>]*)?\/>/.exec(rpr);
      const bold = Boolean(b) && !/w:val="(0|false)"/.test(b![0]);
      if (!bold) allBold = false;
      anyText = true;
      text += t;
    }
    out.push({ text: text.replace(/\s+/g, ' ').trim(), bold: anyText && allBold, level: hasNum ? (lvl ? Number(lvl[1]) : 0) : null });
  }
  return out;
}

export function parseQuestionsFromDocx(buf: Buffer): ParseResult {
  const docXml = readZipEntry(buf, 'word/document.xml');
  if (!docXml) throw new Error('У файлі не знайдено тексту документа (word/document.xml).');
  const paras = extractParagraphs(docXml.toString('utf8')).filter((p) => p.text);

  const questions: ParsedQuestion[] = [];
  const bold: boolean[][] = [];
  const warnings: string[] = [];
  let cur: ParsedQuestion | null = null;

  const startQuestion = (title: string) => {
    cur = { title, options: [], detectedCorrect: [] };
    questions.push(cur);
    bold.push([]);
  };
  const addOption = (text: string, isBold: boolean) => {
    if (!cur) { warnings.push(`Варіант «${text.slice(0, 40)}» стоїть до першого питання й пропущений.`); return; }
    let t = text;
    let marked = isBold;
    if (/^\+\s*/.test(t)) { t = t.replace(/^\+\s*/, ''); marked = true; }
    if (/\s*\*$/.test(t)) { t = t.replace(/\s*\*$/, ''); marked = true; }
    cur.options.push(t.trim());
    bold[bold.length - 1].push(marked);
  };

  for (const p of paras) {
    const opt = /^(\d+)\.(\d+)[.)]?\s*(.*)$/.exec(p.text);
    const q = /^(\d+)[.)]\s*(.*)$/.exec(p.text);
    if (opt) addOption(opt[3], p.bold);
    else if (q && q[2]) startQuestion(q[2]);
    else if (p.level !== null && p.level === 0) startQuestion(p.text);
    else if (p.level !== null && p.level >= 1) addOption(p.text, p.bold);
    else if (cur) {
      // Продовження попереднього рядка (довге питання чи варіант, перенесений на новий рядок)
      const c = cur as ParsedQuestion;
      if (c.options.length) c.options[c.options.length - 1] += ' ' + p.text;
      else c.title += ' ' + p.text;
    } else {
      warnings.push(`Рядок «${p.text.slice(0, 40)}» стоїть до першого питання й пропущений.`);
    }
  }

  // Жирним зазвичай виділена правильна відповідь; якщо жирні всі, виділення нічого не означає
  questions.forEach((qq, i) => {
    const marks = bold[i];
    const count = marks.filter(Boolean).length;
    if (count > 0 && count < marks.length) qq.detectedCorrect = marks.map((m, j) => (m ? j : -1)).filter((j) => j >= 0);
  });

  if (!questions.length) warnings.push('Не знайдено жодного питання. Перевірте формат: «1. Питання» і «1.1. Відповідь».');
  return { questions: questions.slice(0, 300), warnings };
}
