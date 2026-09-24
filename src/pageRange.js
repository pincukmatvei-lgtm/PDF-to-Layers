/**
 * Parses a page range string such as "1-5, 8, 10-12" into a sorted list of
 * unique 1-based page numbers. An empty string selects every page.
 *
 * @param {string} input
 * @param {number} pageCount total number of pages in the document
 * @returns {number[]}
 * @throws {Error} with a user-facing message when the input is invalid
 */
function parsePageRange(input, pageCount) {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error("В документе нет страниц");
  }

  const text = (input || "").trim();
  if (text === "") {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  const pages = new Set();
  for (const rawPart of text.split(/[,;]/)) {
    const part = rawPart.trim();
    if (part === "") continue;

    const match = part.match(/^(\d+)\s*(?:[-–—]\s*(\d+)?)?$/);
    if (!match) {
      throw new Error(`Некорректный фрагмент: «${part}»`);
    }

    const start = Number(match[1]);
    const isRange = /[-–—]/.test(part);
    // "5-" means "from 5 to the last page".
    const end = isRange ? (match[2] ? Number(match[2]) : pageCount) : start;

    if (start < 1 || end < 1) {
      throw new Error("Номера страниц начинаются с 1");
    }
    if (start > end) {
      throw new Error(`Начало диапазона больше конца: «${part}»`);
    }
    if (end > pageCount) {
      throw new Error(`Страницы ${end} нет: в документе ${pageCount} стр.`);
    }

    for (let p = start; p <= end; p++) pages.add(p);
  }

  if (pages.size === 0) {
    throw new Error("Не указано ни одной страницы");
  }
  return [...pages].sort((a, b) => a - b);
}

module.exports = { parsePageRange };
