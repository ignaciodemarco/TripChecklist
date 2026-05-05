// Build/runtime version info. Populated at docker build time via build args
// (see Dockerfile + .github/workflows/deploy-aws-apprunner.yml). Falls back
// to "dev" when running locally.
export const BUILD_SHA = process.env.BUILD_SHA || "dev";
export const BUILD_SHORT_SHA = (process.env.BUILD_SHA || "dev").slice(0, 7);
export const BUILD_TIME = process.env.BUILD_TIME || "unknown";
export const APP_ENV = process.env.NODE_ENV || "development";
