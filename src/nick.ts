// Розбір серверного нікнейму за шаблоном «Відділ | Ім'я Прізвище (або позивний) | Статік».
// Парсер навмисно поблажливий: у реальних нікнеймах бувають пропущені частини та роздільники.
export interface ParsedNick {
  department: string;
  name: string;
  staticId: string;
}

export function parseNick(raw: string | null | undefined): ParsedNick {
  let s = String(raw || '').replace(/\s+/g, ' ').trim();
  let staticId = '';

  // Статік — число (до 8 цифр) наприкінці рядка
  const m = s.match(/(?:^|[\s|#])(\d{1,8})\s*[|]?\s*$/);
  if (m) {
    staticId = m[1];
    s = s.slice(0, m.index! + (m[0].startsWith(m[1]) ? 0 : 1)).trim();
  }
  s = s.replace(/[|\s]+$/g, '').replace(/^[|\s]+/g, '');

  const parts = s.split('|').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { department: parts[0], name: parts.slice(1).join(' '), staticId };
  }
  return { department: '', name: parts[0] || '', staticId };
}
