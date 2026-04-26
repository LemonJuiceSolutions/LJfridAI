import { z } from 'zod';

const isProd = process.env.NODE_ENV === 'production';

// Required always
const coreSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 characters'),
  NEXTAUTH_URL: z.string().url().optional(),
  PYTHON_BACKEND_URL: z.string().optional().default('http://localhost:5005'),
  DATA_LAKE_PATH: z.string().optional().default('data_lake'),
});

// Required in production only
const prodOnlySchema = z.object({
  ENCRYPTION_KEY: z.string().min(1, 'ENCRYPTION_KEY required in production'),
  PII_ENCRYPTION_ENABLED: z.literal('true', {
    errorMap: () => ({ message: 'PII_ENCRYPTION_ENABLED must be "true" in production' }),
  }),
  CRON_SECRET: z.string().min(32, 'CRON_SECRET must be at least 32 characters in production'),
  INTERNAL_QUERY_TOKEN: z.string().min(32, 'INTERNAL_QUERY_TOKEN must be at least 32 characters in production'),
  MCP_INTERNAL_SECRET: z.string().min(32, 'MCP_INTERNAL_SECRET must be at least 32 characters in production'),
  // Shared secret Next.js sends to the Python backend as X-Internal-Token.
  // Must match PYTHON_BACKEND_TOKEN on the Python side; mismatches cause 401.
  PYTHON_BACKEND_TOKEN: z.string().min(32, 'PYTHON_BACKEND_TOKEN must be at least 32 characters in production'),
});

const envSchema = isProd ? coreSchema.merge(prodOnlySchema) : coreSchema.merge(prodOnlySchema.partial());

function validateEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Environment validation failed:');
    result.error.issues.forEach(issue => {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    });
    if (isProd) {
      throw new Error('Invalid environment configuration — refusing to boot in production');
    }
  }
  return result.success ? result.data : undefined;
}

export const env = validateEnv();
