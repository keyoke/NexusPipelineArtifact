import tl = require('azure-pipelines-task-lib/task');
import url = require('url');
import shell = require("shelljs");
import fs = require('fs');
import https = require('https');
import { IncomingMessage } from 'http';

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

        const requestUrl = url.parse(hostUri);
        const buffer = Buffer.from(username + ':' + password);
        let requestPath : string = `/service/rest/v1/search/assets/download?sort=version&maven.groupId=${group}&maven.artifactId=${artifact}&maven.baseVersion=${baseVersion}&maven.extension=${extension}`;

        // Do we have a classifier
        if (classifier) {
            requestPath = `${requestPath}&maven.classifier=${classifier}`
        }
        else
        {
            tl.debug('Classifier has not been supplied.');
        }

        const options : https.RequestOptions = {
            host: requestUrl.hostname,
            port: requestUrl.port || 443, // Default to 443 for port
            path: requestPath,
            method: 'GET',
            rejectUnauthorized: true, // By default ensure we validate SSL certificates
            headers: {
                'Authorization': 'Basic ' + buffer.toString('base64')
             }   
        };

        if(acceptUntrustedCerts)
        {
            options.rejectUnauthorized = false;
        }

        options.agent = new https.Agent(options);

        const filename : string = `${artifact}-${baseVersion}.${extension}`;
        const file : fs.WriteStream = fs.createWriteStream(filename);
        
        tl.debug(`Downloading asset '${filename}' using '${requestUrl.href}${options.path}'.`);

        let req = https.request(options, function(res : IncomingMessage) {      
            tl.debug(`HTTP Response Status Code: ${res.statusCode}.`);
           
            res.on('data', (d) => {
                file.write(d);
            });

            if (res.statusCode == 302) {
                console.log(`Successfully downloaded asset.`);
            }else if (res.statusCode == 404) {
                throw new Error(`Asset does not exist!`);
            } 
        }).end();
    }
    catch (err) {
        tl.setResult(tl.TaskResult.Failed, err.message);
    }
    console.log(`Downloading artifact completed.`);
}

run();