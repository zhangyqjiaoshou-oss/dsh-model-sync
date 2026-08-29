// @ts-check
/** @type {import('tsdown').Config} */
export default {
  entry: ['src/client/index.ts'],
  outDir: 'lib',
  format: 'esm',
  platform: 'browser',
  clean: false,
  dts: false,
  external: [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-connection/client',
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-slots',
  ],
}