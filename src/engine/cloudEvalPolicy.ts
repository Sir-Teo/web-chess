import type { TablebaseStatus } from '../hooks/useTablebase'

type CloudEvalPolicyInput = {
  engineEnabled: boolean
  isBatchReviewing: boolean
  isImportingGame: boolean
  tablebaseEligible: boolean
  tablebaseStatus: TablebaseStatus
}

export function shouldFetchCloudEvaluation({
  engineEnabled,
  isBatchReviewing,
  isImportingGame,
  tablebaseEligible,
  tablebaseStatus,
}: CloudEvalPolicyInput): boolean {
  if (!engineEnabled || isBatchReviewing || isImportingGame) return false
  if (!tablebaseEligible) return true

  return tablebaseStatus === 'missing' || tablebaseStatus === 'error'
}
