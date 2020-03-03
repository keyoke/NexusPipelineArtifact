import tl = require('azure-pipelines-task-lib/task');
import path = require("path");
import fs = require('fs');
import http = require('http');
import https = require('https');

export class nexusV3 {
    public execute_http(searchUri : URL, username : string, password : string) : void
    {
        tl.debug(`execute_http.`);

        const authBase64 : string = Buffer.from(username + ':' + password).toString('base64');

        // Make sure the secret is correctly scrubbed from any logs
        tl.setSecret(authBase64);

        let options : http.RequestOptions = {
            host: searchUri.hostname,
            path: searchUri.pathname,
            method: 'GET',
            headers: {
                'Authorization': 'Basic ' + authBase64,
                'Accept': 'application/json'
            }   
        };

        // Setup new agent dont use the global one
        options.agent = new http.Agent(options);
        options.port = searchUri.port || options.defaultPort;
    
        // execute the http request
        this.execute_request(http, options);
    }

    public execute_https(searchUri : URL, username : string, password : string, acceptUntrustedCerts : boolean) : void
    {
        tl.debug(`execute_https.`);

        const authBase64 : string = Buffer.from(username + ':' + password).toString('base64');

        // Make sure the secret is correctly scrubbed from any logs
        tl.setSecret(authBase64);

        let options : https.RequestOptions = {
            host: searchUri.hostname,
            path: searchUri.pathname,
            method: 'GET',
            rejectUnauthorized: !acceptUntrustedCerts, // By default ensure we validate SSL certificates
            headers: {
                'Authorization': 'Basic ' + authBase64,
                'Accept': 'application/json'
            }   
        };

        // Setup new agent dont use the global one
        options.agent = new https.Agent(options);
        options.port = searchUri.port || options.defaultPort;

        // execute the https request
        this.execute_request(https, options);
    }

    private execute_request(client : any, options :  http.RequestOptions | https.RequestOptions) : void
    {
        tl.debug(`HTTP Request Options: ${JSON.stringify(options)}.`);  

        let req : http.ClientRequest = client.request(options, function(res : http.IncomingMessage) {  
            tl.debug(`HTTP Response Status Code: ${res.statusCode}.`);
            tl.debug(`HTTP Response Headers: ${JSON.stringify(res.headers)}.`);

            if (res.statusCode == 302) {
                const downloadUri : URL = new URL(res.headers.location);

                // Set correct options for the new request to download our file
                options.host = downloadUri.hostname;
                options.path = downloadUri.pathname;
                options.port = downloadUri.port || options.defaultPort;

                tl.debug(`Download asset using '${downloadUri}'.`);
                let filename : string = path.basename(downloadUri.pathname);
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
                        console.log(`Successfully downloaded asset '${filename}' using '${downloadUri}'.`);
                    } else
                    {
                        throw new Error(`Unexpected Request Response - StatusCode: ${inner_res.statusCode}, StatusMessage: ${inner_res.statusMessage}.`);
                    }
                });
                inner_req.end();
            }else if (res.statusCode == 400) {
                throw new Error(`Search returned multiple assets, please refine search criteria to find a single asset!`);
            } else if (res.statusCode == 401) {
                throw new Error(`Access Denied!`);
            }  else if (res.statusCode == 404) {
                throw new Error(`Asset does not exist for search!`);
            } else
            {
                throw new Error(`Unexpected Request Response - StatusCode: ${res.statusCode}, StatusMessage: ${res.statusMessage}.`);
            }
        });
        req.end();
    }
}