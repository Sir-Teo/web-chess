import { describe, expect, it } from 'vitest'
import { shouldFetchCloudEvaluation } from './cloudEvalPolicy'

describe('cloud eval policy', () => {
  it('uses cloud evaluation for normal analysis positions', () => {
    expect(shouldFetchCloudEvaluation({
      engineEnabled: true,
      isBatchReviewing: false,
      isImportingGame: false,
      tablebaseEligible: false,
      tablebaseStatus: 'ineligible',
    })).toBe(true)
  })

  it('defers cloud evaluation while exact tablebase is pending or available', () => {
    for (const tablebaseStatus of ['idle', 'loading', 'hit'] as const) {
      expect(shouldFetchCloudEvaluation({
        engineEnabled: true,
        isBatchReviewing: false,
        isImportingGame: false,
        tablebaseEligible: true,
        tablebaseStatus,
      })).toBe(false)
    }
  })

  it('falls back to cloud evaluation when exact tablebase is unavailable', () => {
    for (const tablebaseStatus of ['missing', 'error'] as const) {
      expect(shouldFetchCloudEvaluation({
        engineEnabled: true,
        isBatchReviewing: false,
        isImportingGame: false,
        tablebaseEligible: true,
        tablebaseStatus,
      })).toBe(true)
    }
  })

  it('stays off during non-interactive engine workflows', () => {
    expect(shouldFetchCloudEvaluation({
      engineEnabled: false,
      isBatchReviewing: false,
      isImportingGame: false,
      tablebaseEligible: false,
      tablebaseStatus: 'ineligible',
    })).toBe(false)
    expect(shouldFetchCloudEvaluation({
      engineEnabled: true,
      isBatchReviewing: true,
      isImportingGame: false,
      tablebaseEligible: false,
      tablebaseStatus: 'ineligible',
    })).toBe(false)
    expect(shouldFetchCloudEvaluation({
      engineEnabled: true,
      isBatchReviewing: false,
      isImportingGame: true,
      tablebaseEligible: false,
      tablebaseStatus: 'ineligible',
    })).toBe(false)
  })
})
