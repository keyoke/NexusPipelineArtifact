import tl = require('azure-pipelines-task-lib/task');
import shell = require("shelljs");
import path = require("path");
import fs = require('fs');
import { HttpHelper } from './HttpHelper';
const helper = new HttpHelper();

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
        const hostUri : URL | undefined = new URL(tl.getEndpointUrl(connection, false));  

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
        // https://repository.sonatype.org/nexus-restlet1x-plugin/default/docs/path__artifact_maven_redirect.html
        let requestPath : string = `/service/local/artifact/maven/redirect?r=${repository}&g=${group}&a=${artifact}&v=${baseVersion}&p=${packaging}`;

        // Do we have a extension
        if (extension) {
            tl.debug(`Using extension ${extension}.`);
            requestPath = `${requestPath}&e=${extension}`
        }
        else
        {
            tl.debug('Extension has not been supplied.');
        }

        // Do we have a classifier
        if (classifier) {
            tl.debug(`Using classifier ${classifier}.`);
            requestPath = `${requestPath}&c=${classifier}`
        }
        else
        {
            tl.debug('Classifier has not been supplied.');
        }
        
        // Build the final search uri
        const searchUri : URL = new URL(path.join(hostUri.pathname, requestPath), hostUri);

        tl.debug(`Search for asset using '${searchUri}'.`);
        // need to refactor this logic to reduce duplication of code
        if (searchUri.protocol === "https:")  {
            helper.execute_https(searchUri, username, password, acceptUntrustedCerts);
        }
        else
        {
            helper.execute_http(searchUri, username, password);
        }
        tl.debug(`Completing search for asset using '${searchUri}'.`);

    }
    catch (err) {
        tl.setResult(tl.TaskResult.Failed, err.message);
    }
    console.log(`Downloading artifact completed.`);
}

run();
