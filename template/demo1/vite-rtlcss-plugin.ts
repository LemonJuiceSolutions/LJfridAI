import { Plugin } from 'vite';
import path from 'path';
import * as sass from 'sass';
import rtlcss from 'rtlcss';
import { writeFileSync, existsSync, mkdirSync } from 'fs';

interface RTLPluginOptions {
  scssFilePath?: string;
  outputDir?: string;
  outputFileName?: string;
  enableSourceMaps?: boolean;
  minify?: boolean;
}

const rtlcssPlugin = (options: RTLPluginOptions = {}): Plugin => {
  const {
    scssFilePath = './src/styles/styles.scss',
    outputDir = './src/styles/rtl-css',
    outputFileName = 'styles.rtl.css',
    enableSourceMaps = false,
    minify = false,
  } = options;

  return {
    name: 'rtl-css',
    enforce: 'post', // Run after Vite build plugins

    async writeBundle() {
      try {
        // Resolve paths relative to project root
        const projectRoot = process.cwd();
        const resolvedScssPath = path.resolve(projectRoot, scssFilePath);
        const resolvedOutputDir = path.resolve(projectRoot, outputDir);
        const outputFilePath = path.join(resolvedOutputDir, outputFileName);

        // Check if source SCSS file exists
        if (!existsSync(resolvedScssPath)) {
          console.warn(`RTL Plugin: Source SCSS file not found at ${resolvedScssPath}`);
          return;
        }

        // Ensure the output directory exists
        try {
          if (!existsSync(resolvedOutputDir)) {
            mkdirSync(resolvedOutputDir, { recursive: true });
            // Create custom RTL CSS file if it doesn't exist
            const customRtlPath = path.join(resolvedOutputDir, 'custom.rtl.css');
            if (!existsSync(customRtlPath)) {
              writeFileSync(customRtlPath, `/* Write your custom RTL CSS here */`, 'utf-8');
            }
          }
        } catch (error) {
          console.error('RTL Plugin: Failed to create output directory:', error);
          return;
        }

        // Compile SCSS to CSS
        let result;
        try {
          result = sass.compile(resolvedScssPath, {
            loadPaths: ['node_modules'],
            style: minify ? 'compressed' : 'expanded',
            sourceMap: enableSourceMaps,
            silenceDeprecations: ['if-function', 'color-functions', 'global-builtin', 'import'],
          });
        } catch (error) {
          console.error('RTL Plugin: SCSS compilation failed:', error);
          return;
        }

        // Convert CSS to RTL
        let rtlResult;
        try {
          rtlResult = rtlcss.process(result.css, {
            // Add RTL CSS options if needed
            autoRename: true,
            stringMap: [
              {
                name: 'left-right',
                priority: 100,
                search: ['left', 'Left', 'LEFT'],
                replace: ['right', 'Right', 'RIGHT'],
                options: {
                  scope: '*',
                  ignoreCase: false,
                },
              },
            ],
          });
        } catch (error) {
          console.error('RTL Plugin: RTL conversion failed:', error);
          return;
        }

        // Write RTL CSS to file
        try {
          writeFileSync(outputFilePath, rtlResult, 'utf-8');

          // Write source map if enabled
          if (enableSourceMaps && result.sourceMap) {
            const sourceMapPath = outputFilePath + '.map';
            writeFileSync(sourceMapPath, JSON.stringify(result.sourceMap), 'utf-8');
          }

          console.log(`✅ RTL CSS generated successfully: ${outputFilePath}`);
        } catch (error) {
          console.error('RTL Plugin: Failed to write output file:', error);
        }
      } catch (error) {
        console.error('RTL Plugin: Unexpected error:', error);
      }
    },
  };
};

export { rtlcssPlugin };
export type { RTLPluginOptions };
