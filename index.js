import fs, { renameSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const PLUGIN_NAME = 'serverless-plugin-monorepo-npm-workspaces';
const DEFAULT_LAYER_PATH = 'layers/main';
const DEFAULT_WORKSPACE_ROOT_DIRECTORY_PATH = '../..';

export default class ServerlessPluginMonorepoNPMWorkspaces {
  constructor(serverless, options, utils) {
    this.serverless = serverless;
    this.options = options; // CLI options
    this.utils = utils;
    this.provider = serverless.getProvider('aws');
    serverless.configSchemaHandler.defineTopLevelProperty(PLUGIN_NAME, {
      type: 'object',
      properties: {
        workspaceRootDirectoryPath: { type: 'string' },
        layerPath: { type: 'string' },
      },
      required: [],
    });
    this.hooks = {
      'before:package:initialize': () => this.beforePackage(),
    };
  }

  beforePackage() {
    this.utils.log(PLUGIN_NAME, 'starting application packaging');

    const { workspaceRootDirectoryPath = DEFAULT_WORKSPACE_ROOT_DIRECTORY_PATH } = this.serverless.service.initialServerlessConfig[PLUGIN_NAME];
    const workspacePackageJsonPath = `${workspaceRootDirectoryPath}/package.json`;
    if (!fs.existsSync(workspacePackageJsonPath)) {
      throw new this.serverless.classes.Error(`Unable to find package.json at workspaceRootDirectoryPath ${workspaceRootDirectoryPath}`);
    }

    const workspaceRootDirectoryPathJson = JSON.parse(fs.readFileSync(workspacePackageJsonPath));
    if (!workspaceRootDirectoryPathJson.workspaces) {
      throw new this.serverless.classes.Error('Workspace package.json does not have a workspaces key');
    }

    const npmCommand = `npm${process.platform === 'win32' ? '.cmd' : ''}`;
    const workspaceNodeModulesPath = `${workspaceRootDirectoryPath}/node_modules`;

    // save current node modules to tmp dir
    this.utils.log(PLUGIN_NAME, 'saving workspace dir node_modules to node_modules_tmp');
    fs.rmSync(`${workspaceNodeModulesPath}_tmp`, { recursive: true, force: true });
    fs.renameSync(workspaceNodeModulesPath, `${workspaceNodeModulesPath}_tmp`);

    // execute command npm ci --workspace=my_package
    const appName = process.cwd().split('/').reverse()[0];
    this.utils.log(PLUGIN_NAME, `generating application ${appName} dependencies`);
    spawnSync(npmCommand, ['ci', `--workspace=${process.cwd().split('/').reverse()[0]}`]);

    // get symlinks from node_modules
    const workspaceNodeModules = fs.readdirSync(workspaceNodeModulesPath, {
      withFileTypes: true,
    });
    const symlinks = [];
    workspaceNodeModules.forEach((entry) => {
      if (entry.isSymbolicLink()) {
        symlinks.push(entry);
      }
    });

    const { layerPath = DEFAULT_LAYER_PATH } = this.serverless.service.initialServerlessConfig[PLUGIN_NAME];
    // copy node_modules from root dir without symlinks to layers/main/nodejs/node_modules
    fs.rmSync(layerPath, { recursive: true, force: true });
    fs.cpSync(workspaceNodeModulesPath, `${layerPath}/nodejs/node_modules`, {
      recursive: true,
      filter: (source) => !symlinks.map((entry) => `${entry.parentPath}/${entry.name}`).includes(source),
    });
    // copy internal deps that where symlinks in root dir to node_modules
    // read package.json deps and copy those that where symlinks in root node_modules to current node_modules
    const currentPackageJson = JSON.parse(fs.readFileSync('./package.json'));
    Object.keys(currentPackageJson.dependencies).forEach((dep) => {
      if (symlinks.find((link) => link.name === dep)) {
        fs.cpSync(`../${dep}`, `./node_modules/${dep}`, {
          recursive: true,
          force: true,
        });
      }
    });

    // remove node_modules generated in root dir
    this.utils.log(PLUGIN_NAME, 'removing temporary files');
    rmSync(workspaceNodeModulesPath, { recursive: true, force: true });
    // replace old node_modules into place
    renameSync(`${workspaceNodeModulesPath}_tmp`, workspaceNodeModulesPath);
  }
}
