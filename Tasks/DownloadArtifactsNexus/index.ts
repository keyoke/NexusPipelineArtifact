import tl = require('azure-pipelines-task-lib/task');
import url = require('url');
import shell = require("shelljs");
import fs = require('fs');
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
        
        // Get the service connection details for communicating with NEXUS
        const hostUrl : string | undefined = tl.getEndpointUrl(connection, false);  
        const auth: tl.EndpointAuthorization | undefined = tl.getEndpointAuthorization(connection, false);

        if(!auth) {
            throw new Error("A valid NEXUS service connections is required!"); 
        }

        // Token,
        tl.debug(`Service endpoint auth.scheme '${auth.scheme}'.`);
        // Get the NEXUS auth details
        const password : string | undefined = auth.parameters["password"];
        const username : string | undefined = auth.parameters["username"];
 
        // Get the NEXUS repository details
        const repository: string | undefined = tl.getInput("repository", false);
        const group: string | undefined = tl.getInput("group", false);
        const artifact: string | undefined = tl.getInput("artifact", false);
        const artifactVersion: string | undefined = tl.getInput("artifactVersion", false);
        const packaging: string | undefined = tl.getInput("packaging", false);
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

            // Get The proxy Url
            var proxyUrl = url.parse(agentProxy.proxyUrl);

            // Is this needed? or is this already included in the url?
            if (agentProxy.proxyUsername && agentProxy.proxyPassword) {
                proxyUrl.auth = agentProxy.proxyUsername + ':' + agentProxy.proxyPassword;
            }
        }

        // Retrieve Artifacts - https://help.sonatype.com/repomanager3/rest-and-integration-api/search-api
        // Works if there is only 1 asset
        // Invoke-WebRequest -uri "$(nexus-url)service/rest/v1/search/assets/download?group=$(nexus-package-groupid)&name=$(nexus-package-name)&maven.baseVersion=$(nexus-package-version)&maven.extension=zip" -Credential $credential -outfile $(nexus-package-name)-$(nexus-package-version).zip
        // *** ONLY Works in Nexus 3.16+ ***
        // Gets latest artifact for a package
        // Invoke-WebRequest -uri "$(nexus-url)service/rest/v1/search/assets/download?sort=version&repository=$(nexus-repository)&maven.groupId=$(nexus-package-groupid)&maven.artifactId=$(nexus-package-name)&maven.baseVersion=$(nexus-package-version)&maven.extension=jar" -Credential $credential -outfile demo-$(nexus-package-version).jar
        
        var options = {
            host: hostUrl,
            path: `/service/rest/v1/search/assets/download?group=${group}&name=${artifact}&maven.baseVersion=${artifactVersion}&maven.extension=${packaging}`,
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + new Buffer(username + ':' + password).toString('base64')
             }   
          };
        
        const file = fs.createWriteStream(`${artifact}-${artifactVersion}.${packaging}`);
        var req = https.request(options, function(res) {       
            res.pipe(file);
          });
    }
    catch (err) {
        tl.setResult(tl.TaskResult.Failed, err.message);
    }
    console.log(`Downloading artifact completed.`);
}

run();