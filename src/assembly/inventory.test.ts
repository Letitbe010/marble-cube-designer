import { describe, expect, it } from 'vitest';
import { addPrinted, compareStock, inventoryToCsv, parseInventoryCsv, setStock } from './inventory';

describe('inventory', () => {
  it('prints only what the shelf lacks', () => {
    const rows = compareStock([{ id: 'A1', count: 3 }, { id: 'B2', count: 1 }, { id: 'C3', count: 2 }], { A1: 1, B2: 4 });
    expect(rows.map((r) => [r.id, r.have, r.toPrint])).toEqual([['A1', 1, 2], ['B2', 4, 0], ['C3', 0, 2]]);
  });

  it('adds the printed pieces and keeps the rest', () => {
    const rows = compareStock([{ id: 'A1', count: 3 }], { A1: 1, Z9: 5 });
    expect(addPrinted({ A1: 1, Z9: 5 }, rows)).toEqual({ A1: 3, Z9: 5 });
  });

  it('drops pieces set to zero and ignores negative or broken counts', () => {
    expect(setStock({ A1: 2 }, 'A1', 0)).toEqual({});
    expect(setStock({}, 'A1', -3)).toEqual({});
    expect(setStock({}, 'A1', Number.NaN)).toEqual({});
    expect(setStock({}, 'A1', 2.7)).toEqual({ A1: 2 });
  });

  it('reads back the CSV it writes', () => {
    const inventory = { B2: 4, A1: 1 };
    const csv = inventoryToCsv(inventory, (id) => (id === 'A1' ? 'Block, 50 mm' : undefined));
    expect(csv.split('\n')[1]).toBe('A1,1,"Block, 50 mm"');
    expect(parseInventoryCsv(csv)).toEqual(inventory);
  });

  it('accepts files saved by spreadsheets', () => {
    expect(parseInventoryCsv('﻿pieza;kopurua\r\n165F;2\r\n\r\n165F;1\r\nplate-4x4;3\r\n')).toEqual({ '165F': 3, 'plate-4x4': 3 });
    expect(parseInventoryCsv('A1\t5')).toEqual({ A1: 5 });
  });

  it('refuses rows that are not id and count', () => {
    expect(() => parseInventoryCsv('id,count\nA1,two')).toThrow();
    expect(() => parseInventoryCsv('A1,1\nB2')).toThrow();
  });
});
