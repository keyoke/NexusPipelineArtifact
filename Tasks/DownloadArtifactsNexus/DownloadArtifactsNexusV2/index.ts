import tl = require('azure-pipelines-task-lib/task');
import url = require('url');
import shell = require("shelljs");
import path = require("path");
import fs = require('fs');
import http = require('http');
import https = require('https');

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
        const hostUri : string | undefined = tl.getEndpointUrl(connection, false);  
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

        const requestUrl : url.UrlWithStringQuery = url.parse(hostUri);
        // https://repository.sonatype.org/nexus-restlet1x-plugin/default/docs/path__artifact_maven_redirect.html
        let requestPath : string = `/service/local/artifact/maven/redirect?r=${repository}&g=${group}&a=${artifact}&v=${baseVersion}&p=${packaging}`;

        // Do we have a extension
        if (extension) {
            tl.debug(`Using extension ${extension}.`);
            requestPath = `${requestPath}&e=${extension}`
        }
        else
        {
            tl.debug('Extension has not been supplied, set default packaging extension.');
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

        tl.debug(`Search for asset using '${url.resolve(requestUrl.href, requestPath)}'.`);
        // need to refactor this logic to reduce duplication of code
        if (hostUri.indexOf("https://") === 0) {
            execute_https(requestUrl, requestPath, username, password, acceptUntrustedCerts);
        }
        else
        {
            execute_http(requestUrl, requestPath, username, password);
        }
        tl.debug(`Completing search for asset using '${url.resolve(requestUrl.href, requestPath)}'.`);

    }
    catch (err) {
        tl.setResult(tl.TaskResult.Failed, err.message);
    }
    console.log(`Downloading artifact completed.`);
}

function execute_http(requestUrl : url.UrlWithStringQuery, requestPath : string, username : string, password : string)
{
    tl.debug(`execute_http.`);

    const authBase64 : string = Buffer.from(username + ':' + password).toString('base64');

    // Make sure the secret is correctly scrubbed from any logs
    tl.setSecret(authBase64);

    let options : http.RequestOptions = {
        host: requestUrl.hostname,
        path: requestPath,
        method: 'GET',
        headers: {
            'Authorization': 'Basic ' + authBase64
         }   
    };

    // Setup new agent dont use the global one
    options.agent = new http.Agent(options);
    options.port = requestUrl.port || options.defaultPort;
   
    // execute the http request
    execute_request(http, options);
}

function execute_https(requestUrl : url.UrlWithStringQuery, requestPath : string, username : string, password : string, acceptUntrustedCerts : boolean)
{
    tl.debug(`execute_https.`);

    const authBase64 : string = Buffer.from(username + ':' + password).toString('base64');

    // Make sure the secret is correctly scrubbed from any logs
    tl.setSecret(authBase64);

    let options : https.RequestOptions = {
        host: requestUrl.hostname,
        path: requestPath,
        method: 'GET',
        rejectUnauthorized: !acceptUntrustedCerts, // By default ensure we validate SSL certificates
        headers: {
            'Authorization': 'Basic ' + authBase64
         }   
    };

    // Setup new agent dont use the global one
    options.agent = new https.Agent(options);
    options.port = requestUrl.port || options.defaultPort;

    // execute the https request
    execute_request(https, options);
}

function execute_request(client : any, options :  http.RequestOptions | https.RequestOptions)
{
    tl.debug(`HTTP Request Options: ${JSON.stringify(options)}.`);  

    let req : http.ClientRequest = client.request(options, function(res : http.IncomingMessage) {  
        tl.debug(`HTTP Response Status Code: ${res.statusCode}.`);
        tl.debug(`HTTP Response Headers: ${JSON.stringify(res.headers)}.`);

        if (res.statusCode == 302) {
            const downloadUrl : url.UrlWithStringQuery = url.parse(res.headers.location);

            // Set correct options for the new request to download our file
            options.host = downloadUrl.hostname;
            options.path = downloadUrl.path;
            options.port = downloadUrl.port || options.defaultPort;

            tl.debug(`Download asset using '${downloadUrl.href}'.`);
            let filename : string = path.basename(downloadUrl.pathname);
            console.log(`Download filename '${filename}'`);

            let inner_req : http.ClientRequest = client.request(options, function(inner_res : http.IncomingMessage) { 
                tl.debug(`HTTP Response Status Code: ${inner_res.statusCode}.`);
                tl.debug(`HTTP Response Headers: ${JSON.stringify(inner_res.headers)}.`);

                if(inner_res.statusCode == 200)
                {
                    const file : fs.WriteStream = fs.createWriteStream(filename);
                    inner_res.on('data', function(chunk : any){
                        file.write(chunk);
                    }).on('end', function(){
                        file.end();
                    });
                    console.log(`Successfully downloaded asset '${filename}' using '${downloadUrl.href}'.`);
                }
            });
            inner_req.end();
        }else if (res.statusCode == 400) {
            throw new Error(`Search returned multiple assets, please refine search criteria to find a single asset!`);
        } else if (res.statusCode == 404) {
            throw new Error(`Asset does not exist for search!`);
        } 
    });
    req.end();
}

run();
