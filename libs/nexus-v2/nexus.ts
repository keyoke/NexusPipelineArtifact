import tl = require('azure-pipelines-task-lib/task');
import path = require("path");
import * as xml2js from 'xml2js';
import * as xpath from "xml2js-xpath";
import { IhttpHelper } from './IhttpHelper';
import { httpHelper } from './httpHelper';
const helper : IhttpHelper = new httpHelper();


export class nexus {
        
    public async downloadAsset(nexusUrl: string, auth: tl.EndpointAuthorization, acceptUntrustedCerts: boolean, repository : string, group : string, artifact : string, baseVersion : string, extension : string, packaging : string, classifier? : string) : Promise<void> {
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
        hostUri.searchParams.append("p", packaging);
    
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
        await this.executeRequest(hostUri, auth, acceptUntrustedCerts);
        console.log(`Completed download asset using '${hostUri}'.`);
    }
        
    public async downloadAssets(nexusUrl: string, auth: tl.EndpointAuthorization, acceptUntrustedCerts: boolean, repository : string, group : string, artifact : string, baseVersion : string, packaging : string, classifier? : string) : Promise<void> {
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
        hostUri.searchParams.append("p", packaging);
        
        // Do we have a classifier
        if (classifier) {        
            hostUri.searchParams.append("c", classifier);
        }        
        console.log(`Search for asset using '${hostUri}'.`);
    
        // perform lucene Search
        var responseContent  = await this.executeRequest(hostUri, auth, acceptUntrustedCerts);
        tl.debug(`Response Content '${responseContent}'.`);
        var extensions : string[] = await this.parseExtensions(responseContent);
    
        // Download each asset    
        for(var extension in extensions){      
            await this.downloadAsset(nexusUrl, auth, acceptUntrustedCerts, repository, group, artifact, baseVersion, extensions[extension], packaging, classifier);
        }
            
        console.log(`Completed search for asset using '${hostUri}'.`);
    }
    
    private async parseExtensions(xml: string) : Promise<string[]> {
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
    
    private async executeRequest(hostUri: URL, auth: tl.EndpointAuthorization, acceptUntrustedCerts: boolean) : Promise<string> {
        var responseContent: string;
        try {
            if (hostUri.protocol === "https:") {
                if (auth.scheme === "UsernamePassword") {
                    responseContent = await helper.execute_https(hostUri, acceptUntrustedCerts, auth.parameters["username"], auth.parameters["password"]);
                }
    
                else {
                    responseContent = await helper.execute_https(hostUri, acceptUntrustedCerts);
                }
            }
    
            else {
                if (auth.scheme === "UsernamePassword") {
                    responseContent = await helper.execute_http(hostUri, auth.parameters["username"], auth.parameters["password"]);
                }
    
                else {
                    responseContent = await helper.execute_http(hostUri);
                }
            }
        } catch (inner_err) {
            console.log(`Failed to execute request '${hostUri}'.`);
            throw inner_err;
        }
        return responseContent;
    }
}