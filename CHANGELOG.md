# Release history
## 1.3.1
- removed sls as peer dependency

## 1.3.0
- use of relative paths to get workspace dependencies
- use of package.patterns in sls conf when copying workspace dependencies

## 1.2.5
- updated symlink removal for cross env compatibility

## 1.2.4
- changed plugin lifecycle to after:package:initialize

## 1.2.3
- updated spawnsync call for windows use

## 1.2.2
- updated error handling for npm ci

## 1.2.1
- fix throw error...

## 1.2.0
- fix throw error

## 1.1.2
- fix throw error

## 1.1.1
- check if workspace directory path contains a node_modules folder or throw
- specify node version >= 18.20 in package.json

## 1.1.0
- fix error undefined if no serverless-plugin-monorepo-npm-workspaces default conf in serverless.yml
- fix error if package directory name in monorepo is different from package.json name property when copying dependencies
- properly handle scoped packages when manipulating symlinks
- use .gitignore and serverless.yml package.patterns conf to skip copying unwanted files

## 1.0.1
- updated readme
- added license
- added changelog

## 1.0.0
- initial version
