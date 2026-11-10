/** How many of each printed piece the user already has, by piece ID. */
export type Inventory = Record<string, number>;

export interface Need {
  id: string;
  count: number;
}

export interface StockRow extends Need {
  have: number;
  toPrint: number;
}

const wholeCount = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);

/** Compares what an assembly needs with what is on the shelf. */
export function compareStock(needs: Need[], inventory: Inventory): StockRow[] {
  return needs.map(({ id, count }) => {
    const have = wholeCount(inventory[id] ?? 0);
    return { id, count, have, toPrint: Math.max(0, count - have) };
  });
}

/** Sets the count of one piece; zero removes it. */
export function setStock(inventory: Inventory, id: string, count: number): Inventory {
  const next = { ...inventory };
  const value = wholeCount(count);
  if (value > 0) next[id] = value;
  else delete next[id];
  return next;
}

/** Adds the pieces that were missing, once they have been printed. */
export function addPrinted(inventory: Inventory, rows: StockRow[]): Inventory {
  let next = inventory;
  for (const { id, toPrint } of rows) {
    if (toPrint > 0) next = setStock(next, id, (inventory[id] ?? 0) + toPrint);
  }
  return next;
}

const quote = (text: string) => (/[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

/** A spreadsheet-friendly copy: id, count and, when known, what the piece is. */
export function inventoryToCsv(inventory: Inventory, describe: (id: string) => string | undefined = () => undefined): string {
  const rows = Object.keys(inventory)
    .sort()
    .map((id) => [id, String(inventory[id]), quote(describe(id) ?? '')].join(','));
  return ['id,count,description', ...rows].join('\n') + '\n';
}

/**
 * Reads a CSV whose first two columns are the piece ID and the count. Commas, semicolons
 * and tabs all work as separators, so a file saved from any spreadsheet can be read back.
 * A first row that is not a count is taken as a header. Repeated IDs add up.
 */
export function parseInventoryCsv(text: string): Inventory {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map((line) => line.trim());
  let inventory: Inventory = {};
  lines.forEach((line, index) => {
    if (line === '') return;
    const [rawId, rawCount = ''] = line.split(/[,;\t]/);
    const id = rawId.replace(/^"|"$/g, '').trim();
    const count = Number(rawCount.replace(/^"|"$/g, '').trim());
    if (rawCount.trim() === '' || !Number.isInteger(count) || count < 0 || id === '') {
      if (index === lines.findIndex((l) => l !== '')) return;
      throw new Error(`Row ${index + 1} is not "id,count": ${line}`);
    }
    inventory = setStock(inventory, id, (inventory[id] ?? 0) + count);
  });
  return inventory;
}
