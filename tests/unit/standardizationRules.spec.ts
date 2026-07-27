import { describe, expect, it } from 'vitest'

import {
  buildRuleContext,
  type ColumnMeta,
  type Dictionaries,
  evaluateColumn,
  mapPgDataType,
  tokenize,
} from '@/standardization/rules'

/**
 * Unit fixture for the standardization rule engine (Task 8.1b; refs 1-66 + 1-75).
 * A hand-built dictionary + a column crafted to isolate EACH of the eight rules,
 * so every SUCCESS/FAIL verdict is asserted deterministically without a DB.
 */

const dict: Dictionaries = {
  terms: [
    { termAbbreviation: 'LVABSN_YMD', termName: '휴직일자', boundDomainName: '연월일C8' },
    { termAbbreviation: 'NO_DOM', termName: '도메인없음', boundDomainName: null },
    { termAbbreviation: 'DANGLING', termName: '댕글링', boundDomainName: '존재안함Z9' },
    { termAbbreviation: 'BAD_TYPE', termName: '나쁜타입', boundDomainName: '여부C1' },
    { termAbbreviation: 'LEN_BAD', termName: '길이나쁨', boundDomainName: '수N7' },
  ],
  words: ['LVABSN', 'YMD', 'WRONG', 'COL', 'NO', 'DOM', 'DANGLING', 'BAD', 'TYPE', 'LEN'].map(
    (abbreviation) => ({ abbreviation }),
  ),
  domains: [
    { domainName: '연월일C8', dataType: 'CHAR', dataLength: 8 },
    { domainName: '여부C1', dataType: 'CHAR', dataLength: 1 },
    { domainName: '수N7', dataType: 'NUMERIC', dataLength: 7 },
  ],
}

const ctx = buildRuleContext(dict)

function col(overrides: Partial<ColumnMeta>): ColumnMeta {
  return {
    tableName: 'lvabsn',
    columnName: 'lvabsn',
    logicalName: '',
    pgDataType: 'character',
    charMaxLength: null,
    numericPrecision: null,
    ...overrides,
  }
}

describe('mapPgDataType', () => {
  it('maps postgres types to canonical buckets', () => {
    expect(mapPgDataType('integer')).toBe('NUMERIC')
    expect(mapPgDataType('numeric')).toBe('NUMERIC')
    expect(mapPgDataType('character')).toBe('CHAR')
    expect(mapPgDataType('character varying')).toBe('VARCHAR')
    expect(mapPgDataType('text')).toBe('TEXT')
    expect(mapPgDataType('timestamp with time zone')).toBe('OTHER')
  })
})

describe('tokenize', () => {
  it('splits on underscores, dropping empties', () => {
    expect(tokenize('lvabsn_end_ymd')).toEqual(['lvabsn', 'end', 'ymd'])
    expect(tokenize('id')).toEqual(['id'])
    expect(tokenize('__a__')).toEqual(['a'])
  })
})

describe('evaluateColumn — one column isolates each rule', () => {
  it('a fully-conformant column fails nothing', () => {
    const v = evaluateColumn(
      col({
        columnName: 'lvabsn_ymd',
        logicalName: '휴직일자',
        pgDataType: 'character',
        charMaxLength: 8,
      }),
      ctx,
    )
    expect(Object.values(v.fails).every((f) => f === false)).toBe(true)
    expect(v.domainName).toBe('연월일C8')
  })

  it('error1 — physical matches a term but logical (comment) differs', () => {
    const v = evaluateColumn(
      col({
        columnName: 'lvabsn_ymd',
        logicalName: '틀린이름',
        pgDataType: 'character',
        charMaxLength: 8,
      }),
      ctx,
    )
    expect(v.fails.error1).toBe(true)
    expect(v.fails.error2).toBe(false)
    expect(v.fails.error3).toBe(false)
    expect(v.fails.error5).toBe(false)
  })

  it('error2 — logical matches a term name but physical differs', () => {
    const v = evaluateColumn(col({ columnName: 'wrong_col', logicalName: '휴직일자' }), ctx)
    expect(v.fails.error2).toBe(true)
    expect(v.fails.error1).toBe(false)
    expect(v.fails.error3).toBe(false)
  })

  it('error3 — a column-name token is not in the word dictionary', () => {
    const v = evaluateColumn(col({ columnName: 'unknown_token_xyz', logicalName: '' }), ctx)
    expect(v.fails.error3).toBe(true)
    expect(v.fails.error1).toBe(false)
    expect(v.fails.error4).toBe(false) // table 'lvabsn' is a known word
  })

  it('error4 — a table-name token is not in the word dictionary', () => {
    const v = evaluateColumn(col({ tableName: 'zzz_unknowntable', columnName: 'lvabsn' }), ctx)
    expect(v.fails.error4).toBe(true)
    expect(v.fails.error3).toBe(false) // column 'lvabsn' is a known word
  })

  it('error5 — matched a term with no bound domain', () => {
    const v = evaluateColumn(col({ columnName: 'no_dom', logicalName: '도메인없음' }), ctx)
    expect(v.fails.error5).toBe(true)
    expect(v.fails.error1).toBe(false)
    expect(v.fails.error6).toBe(false)
    expect(v.domainName).toBe('')
  })

  it('error6 — matched term names a domain absent from the dictionary', () => {
    const v = evaluateColumn(col({ columnName: 'dangling', logicalName: '댕글링' }), ctx)
    expect(v.fails.error6).toBe(true)
    expect(v.fails.error5).toBe(false)
    expect(v.fails.error7).toBe(false) // dangling domain → no domain object to compare
  })

  it('error7 — bound domain type differs from the column type (length matches)', () => {
    const v = evaluateColumn(
      col({
        columnName: 'bad_type',
        logicalName: '나쁜타입',
        pgDataType: 'integer',
        numericPrecision: 1,
      }),
      ctx,
    )
    expect(v.fails.error7).toBe(true) // domain 여부C1 is CHAR, column is NUMERIC
    expect(v.fails.error8).toBe(false) // length 1 == domain length 1
  })

  it('error8 — bound domain length is violated (type matches)', () => {
    const v = evaluateColumn(
      col({
        columnName: 'len_bad',
        logicalName: '길이나쁨',
        pgDataType: 'numeric',
        numericPrecision: 99,
      }),
      ctx,
    )
    expect(v.fails.error8).toBe(true) // domain 수N7 length 7, column length 99
    expect(v.fails.error7).toBe(false) // both NUMERIC
  })
})
