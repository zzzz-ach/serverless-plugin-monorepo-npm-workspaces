# Release history

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
