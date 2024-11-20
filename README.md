# serverless-plugin-monorepo-npm-workspaces

## Compatibility
Only tested with serverless v3.x

## Use case
You are working with a npm workspaces monorepo and you want to be able to deploy several serverless applications independently from each other but with common dependencies.
Each deployed application must not embark other applications code or dependencies.

Your repository structure looks like :
```
.rootDir
| -- package.json
| -- packages
|   `-- pack1
|      `-- package.json
|   `-- pack2
|      `-- package.json
|   `-- app1
|      `-- package.json
|      `-- serverless.yml
|   `-- app2
|      `-- package.json
|      `-- serverless.yml
|   `-- app3
|      `-- package.json
|      `-- serverless.yml

```

where :
- packages is declared in your package.json as your workspace directory
```
"workspaces": [
    "packages/*"
  ]
```
- pack1 and pack2 are common dependencies used by your other serverless applications
- app1, app2, app3 are serverless applications that may use pack1 or pack2 as dependencies

## How to use it
### Installation
- install it via npm 
`npm install serverless-plugin-monorepo-npm-workspaces --save-dev`
- add it to the plugin section of your serverless.yml configuration file. It should look something like this :
```
plugins:
  - serverless-plugin-monorepo-npm-workspaces
```
### Configuration
You can personnalize variables in your `serverless.yml` configuration file. In order to do so, add a new section `serverless-plugin-monorepo-npm-workspaces` at the root of your file :
```
serverless-plugin-monorepo-npm-workspaces:
  workspaceRootDirectoryPath: 'relative path to root workspace dir'
  layerPath: 'path of your layer'
```

By default, the plugin use two variables :
- `workspaceRootDirectoryPath` : 
  - defaults to `../..`
  - is the relative path to your root directory where the workspace is configured in its own package.json
- `layerPath` :
  - defaults to `layers/main`
  - should be the same as the path defined in your layer : something like `${self:layers.your-layer-name.path}`

## How it is working
### Dependencies layer
Each serverless application is deployed with a layer containing its dependencies except the dependencies from the monorepository.

This layer has by default the path `layers/main` but can renamed via the `layerPath` parameter (see [Configuration](#Configuration)).

### Dependencies copy
All dependencies from the monorepository are copied to a temporary node_modules directory at the root of the applications. The dependencies from the deploying application are generated via `npm ci --workspace=my_package` and are then copied (excepted the symlinks) to a layer directory `layerPath` inside the application directory.
Dependencies from the monorepository (the former symlinks) are copied inside the application directory into the `node_modules` directory.

Plugin scans .gitignore files in workspace directory and package directories to prevent copy unwanted files to the packaging application node_modules.
Files from `serverless.yml` package.patterns property are not copied as well.