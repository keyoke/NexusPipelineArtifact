import tl = require('azure-pipelines-task-lib/task');
import url = require('url');
import shell = require("shelljs");
import path = require("path");
import fs = require('fs');
import http = require('http');
import { IncomingMessage, ClientRequest } from 'http';
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

        // Do we have a extension
        if (!extension) {
            tl.debug('Extension has not been supplied, set default packaging extension.');
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
        const authBase64 : string = Buffer.from(username + ':' + password).toString('base64');
        // Make sure the secret is correctly scrubbed from any logs
        tl.setSecret(authBase64);

        let requestPath : string = `/service/rest/v1/search/assets/download?sort=version&maven.groupId=${group}&maven.artifactId=${artifact}&maven.baseVersion=${baseVersion}&maven.extension=${extension}`;

        // Do we have a classifier
        if (classifier) {
            requestPath = `${requestPath}&maven.classifier=${classifier}`
        }
        else
        {
            tl.debug('Classifier has not been supplied.');
        }

        let options : https.RequestOptions = {
            host: requestUrl.hostname,
            port: requestUrl.port || 443, // Default to 443 for port
            path: requestPath,
            method: 'GET',
            rejectUnauthorized: true, // By default ensure we validate SSL certificates
            headers: {
                'Authorization': 'Basic ' + authBase64
             }   
        };

        if(acceptUntrustedCerts)
        {
            // We should accept self signed certificates
            options.rejectUnauthorized = false;
        }

        // Setup new agent dont use the global one
        options.agent = new https.Agent(options);
       
        tl.debug(`Search for asset using '${requestUrl.href}${options.path}'.`);
        //tl.debug(`Search request options '${JSON.stringify(options)}'.`);

        let req : ClientRequest = https.request(options, function(res : IncomingMessage) {  
            let headers : string = JSON.stringify(res.headers);    
            tl.debug(`HTTP Response Status Code: ${res.statusCode}.`);
            tl.debug(`HTTP Response Headers: ${headers}.`);

            if (res.statusCode == 302) {
                const downloadUrl : url.UrlWithStringQuery = url.parse(res.headers.location);
                // Set correect options for the new request to download our file
                options.host = downloadUrl.hostname;
                options.port = downloadUrl.port || 443
                options.path = downloadUrl.path;

                tl.debug(`Download asset using '${downloadUrl.href}'.`);
                //tl.debug(`Download request options '${JSON.stringify(options)}'.`);
                let filename : string = path.basename(downloadUrl.pathname);
                console.log(`Download filename '${filename}'`);

                let inner_req : ClientRequest = https.request(options, function(inner_res : IncomingMessage) { 
                    let headers : string = JSON.stringify(inner_res.headers);
                    tl.debug(`HTTP Response Status Code: ${inner_res.statusCode}.`);
                    tl.debug(`HTTP Response Headers: ${headers}.`);

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
            }else if (res.statusCode == 404) {
                throw new Error(`Asset does not exist for '${requestUrl.href}${options.path}'!`);
            } 
        });
    }
    catch (err) {
        tl.setResult(tl.TaskResult.Failed, err.message);
    }
    console.log(`Downloading artifact completed.`);
}

run();