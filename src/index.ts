// Public API of @framework/http.
// Convention: every interface/type lives in `./types`, every constant in
// `./constants`; runtime values (classes, functions, middleware) stay in their modules.
export { requireAuth } from './authorization/authenticate';
export { authorizationGuard } from './authorization/guard';
export { authenticatedPolicy, authorize, denyAll } from './authorization/policy';
export { currentPrincipal, hasAbility, type PrincipalLike } from './authorization/principal';
export { ERROR_CATALOG, ERROR_CODES, ERROR_STATUSES, REQUEST_CONTEXT } from './constants';
export { resolve } from './context';
export { codesForStatus } from './errors/catalog';
export { installErrorHandling, toErrorResponse } from './errors/handler';
export {
  badRequest,
  conflict,
  forbidden,
  HttpError,
  httpError,
  notFound,
  serviceUnavailable,
  tooManyRequests,
  unauthenticated,
  validationFailed,
} from './errors/http-error';
export type { KernelCorsOptions } from './kernel';
export { createHttpKernel, STRICT_SECURE_HEADERS } from './kernel';
export { MiddlewareRegistry } from './middleware/registry';
export { requestScope } from './middleware/request-scope';
export { throttle } from './middleware/throttle';
export { assertNoDuplicateRoutes, listRoutes } from './routing/routes';
// Grouped conventions: every type in ./types, every constant in ./constants.
export type {
  ActorResolver,
  ErrorCode,
  ErrorEnvelope,
  ErrorHandlingOptions,
  ErrorStatus,
  FieldError,
  FrameworkEnv,
  FrameworkVariables,
  HttpKernelOptions,
  MiddlewareDescription,
  MountAuthorization,
  RequestContext,
  ResourceAbility,
  ResourcePolicy,
  RouteGuard,
  RouteInfo,
} from './types';
