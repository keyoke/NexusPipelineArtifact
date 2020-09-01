# NexusPipelineArtifact
Add support for the Sonatype Nexus Repository as an artifact in Azure Pipelines

# Requirements
- VSCode https://code.visualstudio.com/
- TypeScript https://www.typescriptlang.org/
- NodeJS https://nodejs.org/en/
- Node CLI for Azure DevOps https://github.com/Microsoft/tfs-cli

# Building/Packaging the Extension
 1. git clone https://github.com/keyoke/NexusPipelineArtifact.git 
 3. cd libs\nexus-v2
 4. npm install
 5. npm build
 6. npm link
 3. cd libs\nexus-v3
 4. npm install
 5. npm build
 6. npm link
 3. cd ..\..\
 2. npm install --global npm-link-better
 2. npm install
 3. npm run package

