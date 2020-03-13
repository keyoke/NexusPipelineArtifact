import tl = require('azure-pipelines-task-lib/task');
import shell = require("shelljs");
import path = require("path");
import fs = require('fs');
import { nexusV2 } from './nexusV2';
const nexus = new nexusV2();

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
        const extension: string | undefined = tl.getInput("extension", false);
        const downloadPath: string | undefined = tl.getInput("downloadPath", false);

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
        // https://support.sonatype.com/hc/en-us/articles/213465488
        // https://repository.sonatype.org/nexus-restlet1x-plugin/default/docs/path__artifact_maven_redirect.html
        // Build the final search uri
        let requestPath : string = `/service/local/artifact/maven/redirect`;

        // Handle root path
        if(hostUri.pathname !== "/")
        {
            requestPath = path.join(hostUri.pathname, requestPath);
        }
        hostUri.pathname = requestPath;

        // Query Parameters
        hostUri.searchParams.append("r", repository);
        hostUri.searchParams.append("g", group);
        hostUri.searchParams.append("a", artifact);
        hostUri.searchParams.append("v", baseVersion);
        hostUri.searchParams.append("p", packaging);

        // Do we have a extension
        if (extension) {
            console.log(`Using extension ${extension}.`);
            hostUri.searchParams.append("e", extension);
        }
        else
        {
            console.log('Extension has not been supplied.');
        }

        // Do we have a classifier
        if (classifier) {
            console.log(`Using classifier ${classifier}.`);
            hostUri.searchParams.append("c", classifier);
        }
        else
        {
            console.log('Classifier has not been supplied.');
        }

        console.log(`Search for asset using '${hostUri}'.`);
        try {
            // need to refactor this logic to reduce duplication of code
            if (hostUri.protocol === "https:") {
                await nexus.execute_https(hostUri, username, password, acceptUntrustedCerts);
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
