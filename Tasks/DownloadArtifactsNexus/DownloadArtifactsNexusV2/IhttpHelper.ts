export interface IhttpHelper {
    execute_http(searchUri : URL) : Promise<string>;
    execute_http(searchUri : URL, username? : string, password? : string) : Promise<string>;
    execute_https(searchUri : URL, acceptUntrustedCerts : boolean)  : Promise<string>;
    execute_https(searchUri : URL, acceptUntrustedCerts : boolean, username? : string, password? : string)  : Promise<string>
};