/* eslint-disable @typescript-eslint/restrict-template-expressions */

import {promises as fs} from 'fs';
import path from 'path';
import colors from 'colors';
import {ClassnamesGenerator} from './ClassnamesGenerator';
import {TTailwindCSSConfig} from '../types/config';
import {TailwindConfigParser} from './TailwindConfigParser';
import {FileContentGenerator} from './FileContentGenerator';

type TCliOptions = {
  configFilename: string | void;
  outputFilename: string | void;
  customClassesFilename: string | void;
};

/**
 * Responsible for writing a file with the generated content to the disk.
 */
export class GeneratedFileWriter {
  private readonly _configFilename: string | void;
  private readonly _outputFilename: string | void;
  private readonly _customClassesFilename: string | void;
  private _configFileData = '';

  /**
   * Initializes a new instance of `GeneratedFileWriter` class.
   * @param options The parsed CLI options from user input.
   */
  constructor(options: TCliOptions) {
    this._configFilename = options.configFilename;
    this._outputFilename = options.outputFilename;
    this._customClassesFilename = options.customClassesFilename;
  }

  /**
   * Writes the generated file to disk.
   */
  public write = async (): Promise<void> => {
    // Check CLI inputs
    try {
      await this.validateCliOptions();
    } catch (error) {
      return;
    }

    // If inputs are valid, read the tailwind config file
    await this.readTailwindConfigFile();

    // Then create a file with the generated types
    fs.writeFile(`${this._outputFilename}`, this.generateFileContent(), 'utf8')
      .then(() => {
        this.printCliMessage(
          'success',
          `Types has successfully been generated in ${this._outputFilename} file.`,
        );
      })
      .catch(error => {
        this.printCliMessage('error', error);
      });
  };

  private readTailwindConfigFile = async (): Promise<void> => {
    try {
      this._configFileData = await fs.readFile(`./${this._configFilename}`, {encoding: 'utf-8'});
    } catch (err) {
      this.printCliMessage('error', `Error Reading: "./${this._configFilename}"`);
    }
  };

  private generateFileContent = (): string => {
    // Evaluate the config as a JS object
    const configEval = eval(
      this._configFileData.replace(/(['"])?plugins(['"])? *: *\[(.*|\n)*?],?/g, ''),
    ) as TTailwindCSSConfig;

    // Parse the config with the config scanner
    const scanner = new TailwindConfigParser(configEval, {
      pluginTypography: this._configFileData.includes('@tailwindcss/typography'),
      pluginCustomForms: this._configFileData.includes('@tailwindcss/custom-forms'),
    });

    // Generate all classnames from the config
    const generatedClassnames = new ClassnamesGenerator(scanner).generate();

    // Create the file content from the generated classes
    const contentGenerator = new FileContentGenerator(generatedClassnames, scanner.getPrefix());
    const fileContentTemplate = contentGenerator.generateFileContent();

    // Resolve the custom classes import path relative to the output file
    let customClassesImportPath: string | null = null;
    if (!!this._outputFilename && !!this._customClassesFilename) {
      customClassesImportPath = path
        .join(
          path.relative(
            path.join(process.cwd(), path.dirname(this._outputFilename)),
            path.join(process.cwd(), path.dirname(this._customClassesFilename)),
          ),
          path.basename(this._customClassesFilename),
        )
        // Convert any Windows path separators to posix
        .replace(/\\/g, '/')
        .replace(/(\.d)?\.ts$/, '');
      customClassesImportPath =
        customClassesImportPath[0] === '.'
          ? customClassesImportPath
          : `./${customClassesImportPath}`;
    }

    // Return final file content
    return (
      fileContentTemplate
        // Append the custom classes types from external file if provided.
        .replace(
          /T_CUSTOM_CLASSES_IMPORT_STATEMENT/g,
          !!customClassesImportPath
            ? `import type TCustomClassesFromExternalFile from '${customClassesImportPath}';`
            : '',
        )
        .replace(
          / ?IMPORTED_T_CUSTOM_CLASSES_KEY/g,
          !!customClassesImportPath ? ' | TCustomClassesFromExternalFile' : '',
        )
        .replace(
          / ?IMPORTED_T_CUSTOM_CLASSES_ARG/g,
          !!customClassesImportPath ? '| TCustomClassesFromExternalFile\n' : '',
        )
    );
  };

  private validateCliOptions = (): Promise<void> => {
    // Check for missing cli options

    if (!this._configFilename) {
      this.printCliMessage('error', 'tailwindcss config file name or path is not provided');
      throw new Error();
    }
    if (!this._outputFilename) {
      this.printCliMessage('error', 'Please provide a valid filename to add generated types to it');
      throw new Error();
    }

    // Check for invalid custom classes file content
    if (!!this._customClassesFilename) {
      return fs
        .readFile(`./${this._customClassesFilename}`)
        .then(data => {
          if (!data.toString().includes('export default')) {
            this.printCliMessage(
              'error',
              'The type having the custom classes must be a default export',
            );
          }
        })
        .catch(error => {
          this.printCliMessage('error', `Unable to read the file with custom types. ${error}`);
          throw new Error();
        });
    }

    return Promise.resolve();
  };

  private printCliMessage = (type: 'error' | 'success', message: string): void => {
    const formattedMessage = '\n\n' + message + '\n' + '\n\n';

    switch (type) {
      case 'success':
        console.log(colors.black.bgGreen(formattedMessage));
        break;
      case 'error':
        console.error(colors.white.bgRed(formattedMessage));
        break;
      default:
        console.log(formattedMessage);
        break;
    }
  };
}
