import tl = require('azure-pipelines-task-lib/task');
import shell = require("shelljs");
import path = require("path");
import fs = require('fs');
import n = require('nexus-v3');
const nexus = new n.nexus();

async function run() {
    console.log(`Downloading artifact.`);
    try {
        // Are we debugging?
        const systemDebug = (/true/i).test((process.env.SYSTEM_DEBUG ? process.env.SYSTEM_DEBUG : "false"));
        // Get the task parameters
        const connection : string | undefined = tl.getInput("connection", false);

        if(!connection)
        {
            throw new Error("Invalid service endpoint.");
        }
        
        // Get the service connection details for communicating with Nexus
        let hostUri : URL | undefined = new URL(tl.getEndpointUrl(connection, false));  

        if(!hostUri)
        {
            throw new Error("A valid Nexus service connection Url is required!"); 
        }

        const auth: tl.EndpointAuthorization | undefined = tl.getEndpointAuthorization(connection, false);

        if(!auth) {
            throw new Error("A valid Nexus service connections is required!"); 
        }

        // Token,
        tl.debug(`Service endpoint auth.scheme '${auth.scheme}'.`);

        // Get the SSL cert options
        const acceptUntrustedCerts = (/true/i).test((tl.getEndpointDataParameter(connection, "acceptUntrustedCerts", true) ? tl.getEndpointDataParameter(connection, "acceptUntrustedCerts", true) : "false"));
        tl.debug(`acceptUntrustedCerts is set to '${acceptUntrustedCerts}'.`);
        
        // Get the Nexus repository details
        const repository: string | undefined = tl.getInput("definition", true);
        const group: string | undefined = tl.getInput("group", true);
        const artifact: string | undefined = tl.getInput("artifact", true);
        const baseVersion: string | undefined = tl.getInput("version", true);
        const packaging: string | undefined = tl.getInput("packaging", true);
        const classifier: string | undefined = tl.getInput("classifier", false);
        let extension: string | undefined = tl.getInput("extension", false);
        const downloadPath: string | undefined = tl.getInput("downloadPath", false);

        // Do we have a extension
        if (!extension) {
            console.log('Extension has not been supplied, set default packaging extension.');
            extension = packaging;
        }

        // Verify artifact download path is set
        if(!downloadPath)
        {
            throw new Error("Invalid downloadPath.");
        }

        tl.debug(`Checking if downloadPath folder '${downloadPath}' exists.`);
        // Create the repo folder if doesnt exist
        if (!fs.existsSync(downloadPath)) {
            tl.debug('downloadPath folder does not exist therefore creating folder.');
            shell.mkdir(downloadPath);
        }      
        
        // Set working folder
        shell.cd(downloadPath);  

        // Get the proxy configured for the DevOps Agent
        const agentProxy : tl.ProxyConfiguration | null = tl.getHttpProxyConfiguration();
        const httpProxy : string | undefined = process.env.HTTP_PROXY;
        const httpsProxy : string | undefined = process.env.HTTPS_PROXY;

        if(httpProxy)
        {
            tl.debug(`Environment Variable HTTP_PROXY set to '${httpProxy}'.`);
        }
        if(httpsProxy)
        {
            tl.debug(`Environment Variable HTTPS_PROXY set to '${httpsProxy}'.`);
        }

        // Is a Proxy set?
        if(agentProxy)
        {
            tl.debug(`Agent proxy is set to '${agentProxy.proxyUrl}'.`);
        }

        tl.debug(`HostUri set to '${hostUri}'`);

        console.log(`Using Packaging ${packaging}.`);

        if(extension)
        {
            console.log(`Using extension ${extension}.`);
        }
        else
        {                  
            console.log('Extension has not been supplied.');             
        }

        if (classifier)             
        {
            console.log(`Using classifier ${classifier}.`);
        }
        else
        {
            console.log('Classifier has not been supplied.');
        }
        
        // Do we have packaging and extension? if not lets download all files.
        // https://help.sonatype.com/repomanager3/repository-manager-concepts/components%2C-repositories%2C-and-repository-formats
        // if(!extension)
        // {                     
        //     await nexus.downloadAssets(hostUri.href,  auth, acceptUntrustedCerts, repository, group, artifact, baseVersion, packaging, classifier);
       //  }
        // else
        // {
            await nexus.downloadAsset(hostUri.href, auth, acceptUntrustedCerts, repository, group, artifact, baseVersion, extension, packaging, classifier);
        // }

    }
    catch (err) {
        tl.setResult(tl.TaskResult.Failed, err.message);
    }
    console.log(`Downloading artifact completed.`);
}

run();
