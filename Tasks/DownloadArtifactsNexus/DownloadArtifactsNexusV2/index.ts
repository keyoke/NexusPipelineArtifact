import tl = require('azure-pipelines-task-lib/task');
import shell = require("shelljs");
import path = require("path");
import fs = require('fs');
import * as xml2js from 'xml2js';
import * as xpath from "xml2js-xpath";
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

        // Get the SSL cert options
        const acceptUntrustedCerts = (/true/i).test((tl.getEndpointDataParameter(connection, "acceptUntrustedCerts", true) ? tl.getEndpointDataParameter(connection, "acceptUntrustedCerts", true) : "false"));
        tl.debug(`acceptUntrustedCerts is set to '${acceptUntrustedCerts}'.`);
        
        // Get the Nexus repository details
        const repository: string | undefined = tl.getInput("repository", true);
        const group: string | undefined = tl.getInput("group", true);
        const artifact: string | undefined = tl.getInput("artifact", true);
        const baseVersion: string | undefined = tl.getInput("version", true);
        const packaging: string | undefined = tl.getInput("packaging", false);
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

        if(packaging)
        {
            console.log(`Using Packaging ${packaging}.`);
        }
        else
        {       
            console.log('Packaging has not been supplied.');            
        }

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
        if(!extension)
        {         
            await downloadAssets(hostUri.href,  auth, acceptUntrustedCerts, repository, group, artifact, baseVersion, classifier, packaging);
        }
        else
        {
            await downloadAsset(hostUri.href, auth, acceptUntrustedCerts, repository, group, artifact, baseVersion, extension, classifier, packaging);
        }
    }
    catch (err) {
        tl.setResult(tl.TaskResult.Failed, err.message);
    }
    console.log(`Downloading artifact completed.`);
}

async function downloadAsset(nexusUrl: string, auth: tl.EndpointAuthorization, acceptUntrustedCerts: boolean, repository : string, group : string, artifact : string, baseVersion : string, extension : string, classifier? : string, packaging? : string) : Promise<void> {
    // Build the final download uri
    // https://support.sonatype.com/hc/en-us/articles/213465488
    // https://repository.sonatype.org/nexus-restlet1x-plugin/default/docs/path__artifact_maven_redirect.html
    let hostUri = new URL(nexusUrl);
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

    if(packaging)
    {
        hostUri.searchParams.append("p", packaging);
    }

    // Do we have a extension
    if (extension) {
        hostUri.searchParams.append("e", extension);
    }

    // Do we have a classifier
    if (classifier) {
        hostUri.searchParams.append("c", classifier);
    }

    console.log(`Download asset using '${hostUri}'.`);
    // Execute the request
    await executeRequest(hostUri, auth, acceptUntrustedCerts);
    console.log(`Completed download asset using '${hostUri}'.`);
}

async function downloadAssets(nexusUrl: string, auth: tl.EndpointAuthorization, acceptUntrustedCerts: boolean, repository : string, group : string, artifact : string, baseVersion : string, classifier? : string, packaging? : string) : Promise<void> {
    // Build the final search uri
    // https://repository.sonatype.org/nexus-indexer-lucene-plugin/default/docs/path__lucene_search.html
    // https://nexusrepov2vm1.azure-zone.net:8443/nexus/service/local/lucene/search?repositoryId=releases&g=org.apache.maven&a=maven-artifact&v=3.6.3
    // https://repository.sonatype.org/nexus-indexer-lucene-plugin/default/docs/el_ns0_searchNGResponse.html
    // https://repository.sonatype.org/nexus-indexer-lucene-plugin/default/docs/ns0.xsd
    let hostUri = new URL(nexusUrl);
    let lucenePath : string = `/service/local/lucene/search`;

    // Handle root path
    if(hostUri.pathname !== "/")
    {
        lucenePath = path.join(hostUri.pathname, lucenePath);
    }
    hostUri.pathname = lucenePath;
    // Query Parameters    
    hostUri.searchParams.append("repositoryId", repository);
    hostUri.searchParams.append("g", group);
    hostUri.searchParams.append("a", artifact);
    hostUri.searchParams.append("v", baseVersion);    
    // Do we have a classifier
    if (classifier) {        
        hostUri.searchParams.append("c", classifier);
    }
    if(packaging)
    {
        hostUri.searchParams.append("p", packaging);
    }
    console.log(`Search for asset using '${hostUri}'.`);

    // perform lucene Search
    var responseContent  = await executeRequest(hostUri, auth, acceptUntrustedCerts);
    tl.debug(`Response Content '${responseContent}'.`);
    var extensions : string[] = await parseExtensions(responseContent);

    // Download each asset    
    for(var extension in extensions){      
        await downloadAsset(nexusUrl, auth, acceptUntrustedCerts, repository, group, artifact, baseVersion, extensions[extension], classifier);
    }

    console.log(`Completed search for asset using '${hostUri}'.`);
}

async function parseExtensions(xml: string) : Promise<string[]> {
    return new Promise((resolve, reject) => {
        xml2js.parseString(xml, { explicitArray : false },  function (err, result) {
            if(err)
            {
                console.log(`Failed to parse response XML.`);
                reject(err);                              
            }   
            else
            {                
                if(result.searchNGResponse.totalCount == 1)
                {
                    resolve(xpath.find(result.searchNGResponse.data.artifact.artifactHits, "//extension"));                       
                }   
                else
                {
                    let message = `Search result XML contains multiple artifactHits.`;
                    console.log(message);
                    reject(message);  
                }
            }
        });
    });
}

async function executeRequest(hostUri: URL, auth: tl.EndpointAuthorization, acceptUntrustedCerts: boolean) : Promise<string> {
    var responseContent: string;
    try {
        if (hostUri.protocol === "https:") {
            if (auth.scheme === "UsernamePassword") {
                responseContent = await nexus.execute_https(hostUri, acceptUntrustedCerts, auth.parameters["username"], auth.parameters["password"]);
            }

            else {
                responseContent = await nexus.execute_https(hostUri, acceptUntrustedCerts);
            }
        }

        else {
            if (auth.scheme === "UsernamePassword") {
                responseContent = await nexus.execute_http(hostUri, auth.parameters["username"], auth.parameters["password"]);
            }

            else {
                responseContent = await nexus.execute_http(hostUri);
            }
        }
    } catch (inner_err) {
        console.log(`Failed to execute request '${hostUri}'.`);
        throw inner_err;
    }
    return responseContent;
}

run();
