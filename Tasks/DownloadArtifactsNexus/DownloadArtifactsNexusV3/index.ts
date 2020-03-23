import tl = require('azure-pipelines-task-lib/task');
import shell = require("shelljs");
import path = require("path");
import fs = require('fs');
import { IhttpHelper } from './IhttpHelper';
import { httpHelper } from './httpHelper';
const nexus : IhttpHelper = new httpHelper();

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
        // Get the Nexus auth details
        const password : string | undefined = auth.parameters["password"];
        const username : string | undefined = auth.parameters["username"];
        // Get the SSL cert options
        const acceptUntrustedCerts = (/true/i).test((tl.getEndpointDataParameter(connection, "acceptUntrustedCerts", true) ? tl.getEndpointDataParameter(connection, "acceptUntrustedCerts", true) : "false"));
        tl.debug(`acceptUntrustedCerts is set to '${acceptUntrustedCerts}'.`);
        
        // Get the Nexus repository details
        const repository: string | undefined = tl.getInput("repository", true);
        const group: string | undefined = tl.getInput("group", true);
        const artifact: string | undefined = tl.getInput("artifact", true);
        const baseVersion: string | undefined = tl.getInput("baseVersion", true);
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
        // https://help.sonatype.com/repomanager3/rest-and-integration-api/search-api
        // Build the final search uri
        let requestPath : string = `/service/rest/v1/search/assets/download`;

        // Handle root path
        if(hostUri.pathname !== "/")
        {
            requestPath = path.join(hostUri.pathname, requestPath);
        }
        hostUri.pathname = requestPath;

        // Query Parameters
        
        // *** ONLY Works in Nexus 3.16+ *** 
        // https://help.sonatype.com/repomanager3/rest-and-integration-api/search-api#SearchAPI-DownloadingtheLatestVersionofanAsset
        // We could use /service/rest/v1/status and look at the response header "server: Nexus/3.21.1-01 (OSS)"
        // hostUri.searchParams.append("sort", "version");
        // *** ONLY Works in Nexus 3.16+ *** 

        hostUri.searchParams.append("repository", repository);
        hostUri.searchParams.append("maven.groupId", group);
        hostUri.searchParams.append("maven.artifactId", artifact);
        hostUri.searchParams.append("maven.baseVersion", baseVersion);
        hostUri.searchParams.append("maven.extension", extension);
        hostUri.searchParams.append("maven.classifier", "");

        // Do we have a classifier
        if (classifier) {
            console.log(`Using classifier ${classifier}.`);
            hostUri.searchParams.set("maven.classifier",classifier);
        }
        else
        {
            console.log('Classifier has not been supplied.');
        }

        console.log(`Search for asset using '${hostUri}'.`);
        try {
            // need to refactor this logic to reduce duplication of code
            if (hostUri.protocol === "https:") {
                await nexus.execute_https(hostUri, acceptUntrustedCerts, username, password);
            }
            else
            {
                await nexus.execute_http(hostUri, username, password);
            }
            console.log(`Completed search for asset using '${hostUri}'.`);
        } catch (inner_err) {
            console.log(`Could not complete search for asset using '${hostUri}'.`);
            throw inner_err;
        }

    }
    catch (err) {
        tl.setResult(tl.TaskResult.Failed, err.message);
    }
    console.log(`Downloading artifact completed.`);
}

run();
