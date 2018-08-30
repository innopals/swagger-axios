import * as yargs from 'yargs';
import * as fs from 'fs';

const DEFAULT_CONFIG_PATH = './swagger-axios.json';

export interface CodeGenConfig {
  skipTags: boolean;
  out: string;
  include: string[];
  exclude: string[];
  resultDataField?: string;
  resultErrorField?: string;
  js: boolean;
  axiosInstancePath?: string;
}

export interface CliConfig extends CodeGenConfig {
  force: boolean;
  url: string;
}

export async function parseArgv(): Promise<CliConfig> {
  const argv = yargs.config(
    fs.existsSync(DEFAULT_CONFIG_PATH) ? {
      extends: DEFAULT_CONFIG_PATH
    } : {}
  ).config(
    "config", "Specify a config file to override defaults"
  ).options({
    force: {
      alias: 'f',
      describe: 'Disable wipe out notice.',
      boolean: true,
      default: false
    },
    url: {
      alias: 'u',
      describe: 'Url to load api doc from',
      string: true,
      require: true
    },
    out: {
      alias: 'o',
      describe: 'Specify the output directory, the whole directory will be wiped out',
      string: true,
      require: true
    },
    include: {
      alias: 'i',
      array: true,
      string: true,
      describe: 'The api prefix to include, all will be included if not specified',
      default: []
    },
    exclude: {
      alias: 'x',
      array: true,
      string: true,
      describe: 'The api prefix to exclude',
      default: []
    },
    "skip-tags": {
      boolean: true,
      describe: 'Skip api tag folder',
      default: false
    },
    "result-data-field": {
      describe: 'Data field from the response object'
    },
    "result-error-field": {
      describe: 'Error field from the response object'
    },
    js: {
      boolean: true,
      describe: 'Generate js code using tsc.',
      default: true
    },
    "axios-instance-path": {
      describe: 'Path to the axios instance, which handles auth, base url, result unwrapping etc. If not set, generated axios instance will be used.'
    }
  }).help().argv as any as CliConfig;
  return argv;
}
