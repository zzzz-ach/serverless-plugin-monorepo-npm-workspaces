import fs, { renameSync, rmSync } from 'node:fs';
import path from 'node:path';
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
      'after:package:initialize': () => this.afterPackage(),
    };
  }

  afterPackage() {
    this.utils.log(PLUGIN_NAME, 'starting application packaging');
    if (!this.serverless.version.startsWith('3')) {
      this.utils.log(`This plugin has only been tested with serverless v3.x, it may not be working for your version ${this.serverless.version}`);
    }
    const workspaceRootDirectoryPath = this.serverless.service.initialServerlessConfig[PLUGIN_NAME]?.workspaceRootDirectoryPath || DEFAULT_WORKSPACE_ROOT_DIRECTORY_PATH;
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

    // read package.json
    const currentPackageJson = JSON.parse(fs.readFileSync('./package.json'));

    // execute command npm ci --workspace=my_package
    this.utils.log(PLUGIN_NAME, `generating application ${currentPackageJson.name} dependencies`);
    const spawn = spawnSync(npmCommand, ['ci', `--workspace=${currentPackageJson.name}`], { shell: true });
    if (spawn.stderr.length) {
      this.utils.log(`npm ci command stderr output: ${spawn.stderr.toString()}`);
    }

    // get symlinks from node_modules
    if (!fs.existsSync(workspaceNodeModulesPath)) {
      // eslint-disable-next-line max-len
      this.utils.log(`workspace node_modules path not found, value is ${workspaceNodeModulesPath} but workspace root directory path ${workspaceRootDirectoryPath} leads to ${path.resolve(workspaceRootDirectoryPath)} and current working directory is ${process.cwd()}`);
      throw new this.serverless.classes.Error('Workspace node_modules folder not found');
    }
    const workspaceNodeModules = fs.readdirSync(workspaceNodeModulesPath, {
      withFileTypes: true,
    });
    const symlinks = [];
    workspaceNodeModules.forEach((entry) => {
      // scoped packages
      if (entry.name.startsWith('@')) {
        const scopePackage = fs.readdirSync(`${entry.parentPath}/${entry.name}`, {
          withFileTypes: true,
        });
        scopePackage.forEach((subPackage) => {
          if (subPackage.isSymbolicLink()) {
            symlinks.push(subPackage);
            symlinks.push({
              ...subPackage,
              fullName: `${entry.name}/${subPackage.name}`,
            });
            rmSync(`${subPackage.parentPath}/${subPackage.name}`, { recursive: true, force: true });
          }
        });
      } else if (entry.isSymbolicLink()) {
        symlinks.push({
          ...entry,
          fullName: entry.name,
        });
        rmSync(`${entry.parentPath}/${entry.name}`, { recursive: true, force: true });
      }
    });

    const layerPath = this.serverless.service.initialServerlessConfig[PLUGIN_NAME]?.layerPath || DEFAULT_LAYER_PATH;
    // copy node_modules from root dir without symlinks to layers/main/nodejs/node_modules
    fs.rmSync(layerPath, { recursive: true, force: true });
    fs.cpSync(workspaceNodeModulesPath, `${layerPath}/nodejs/node_modules`, {
      recursive: true,
    });

    // get a map of directories in workspaces with dirname <> package name
    const packageNames = new Map();
    const workspacePackages = fs.readdirSync('..', {
      withFileTypes: true,
    });

    workspacePackages.forEach((workspacePackage) => {
      const packageJson = `../${workspacePackage.name}/package.json`;
      if (workspacePackage.isDirectory() && fs.existsSync(packageJson)) {
        const packageJsonDir = JSON.parse(fs.readFileSync(packageJson));
        packageNames.set(packageJsonDir.name, { packageJson: packageJsonDir, workspacePackageName: workspacePackage.name });
      }
    });

    // copy internal deps that where symlinks in root dir to node_modules
    const toIgnore = ['.gitignore'];
    if (this.serverless.service.initialServerlessConfig.package?.patterns?.length) {
      // eslint-disable-next-line no-unsafe-optional-chaining
      toIgnore.push(...this.serverless.service.initialServerlessConfig.package?.patterns.map((pattern) => {
        let sanitizedPattern = pattern.startsWith('!') ? pattern.substring(1) : pattern;
        if (sanitizedPattern.endsWith('/**')) {
          sanitizedPattern = sanitizedPattern.substring(0, sanitizedPattern.length - 3);
        }
        return sanitizedPattern;
      }));
    }
    if (fs.existsSync(`${workspaceRootDirectoryPath}/.gitignore`)) {
      const workspaceGitIgnore = fs.readFileSync(`${workspaceRootDirectoryPath}/.gitignore`, { encoding: 'utf8' });
      toIgnore.push(...workspaceGitIgnore.split('\n'));
    }
    if (fs.existsSync('.gitignore')) {
      const currentGitIgnore = fs.readFileSync('.gitignore', { encoding: 'utf8' });
      toIgnore.push(...currentGitIgnore.split('\n'));
    }

    function copyMonorepoDependencies(packageJson) {
      Object.keys(packageJson.dependencies).forEach((dep) => {
        if (symlinks.find((link) => link.fullName === dep)) {
          const packageName = `../${packageNames.get(dep).workspacePackageName}`;
          const depToIgnore = [];
          if (fs.existsSync(`${packageName}/.gitignore`)) {
            depToIgnore.push(fs.readFileSync(`${packageName}/.gitignore`, { encoding: 'utf8' }).split('\n'));
          }
          fs.cpSync(`../${packageNames.get(dep).workspacePackageName}`, `./node_modules/${dep}`, {
            recursive: true,
            force: true,
            filter: (source) => {
              const filePath = source.split('/');
              const toIgnoreAll = [...toIgnore, ...depToIgnore];
              let res = true;
              toIgnoreAll.forEach((tia) => {
                if (filePath.some((t) => t === tia)) {
                  res = false;
                }
              });
              return res;
            },
          });
          copyMonorepoDependencies(packageNames.get(dep).packageJson);
        }
      });
    }

    copyMonorepoDependencies(currentPackageJson);

    // remove node_modules generated in root dir
    this.utils.log(PLUGIN_NAME, 'removing temporary files');
    rmSync(workspaceNodeModulesPath, { recursive: true, force: true });
    // replace old node_modules into place
    renameSync(`${workspaceNodeModulesPath}_tmp`, workspaceNodeModulesPath);
  }
}
