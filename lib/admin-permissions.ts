export type WorkerAccessScope = {
  isSuperAdmin: boolean;
  isTeamAdmin: boolean;
};

export const ADD_WORKER_RESTRICTED_MESSAGE =
  "Department Heads cannot add workers directly. Please contact your Team Leader to add a worker.";

export const PROXY_CHECK_IN_RESTRICTED_MESSAGE =
  "Department Heads cannot sign in workers directly. Please contact your Team Leader to sign in a worker.";

export function canManageWorkerAccess(scope: WorkerAccessScope) {
  return scope.isSuperAdmin || scope.isTeamAdmin;
}
